import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { isOfficeDocument, officeExtension, officeTypes } from '../shared/office.mjs';

const root = await realpath(process.env.DOCUMENTS_ROOT || 'public/documents');
const userRoot = process.env.USER_DOCUMENTS_ROOT ? await realpath(process.env.USER_DOCUMENTS_ROOT) : null;
const secret = randomBytes(32);
const collabora = process.env.COLLABORA_INTERNAL_URL || 'http://collabora:9980';
const wopiBase = process.env.WOPI_BASE_URL || 'http://documents:3000';
const lifetime = 60 * 60 * 1000;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const fail = (status, message) => Object.assign(new Error(message), { status });
const signature = (value) => createHmac('sha256', secret).update(value).digest('base64url');
const issueToken = (id, expiry) => `${expiry}.${signature(`${id}:${expiry}`)}`;

const validToken = (id, token) => {
  const [expiry, supplied, extra] = String(token || '').split('.');
  if (extra || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now() || !supplied) return false;
  const expected = Buffer.from(signature(`${id}:${expiry}`));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const resolveDocument = async (relative, documentRoot = root) => {
  if (!relative || relative.includes('\0') || relative.includes('\\')
    || path.isAbsolute(relative) || !isOfficeDocument(relative)) {
    throw fail(400, 'Document non pris en charge.');
  }
  const filename = await realpath(path.resolve(documentRoot, relative));
  if (!filename.startsWith(`${documentRoot}${path.sep}`)) throw fail(403, 'Accès refusé.');
  const info = await stat(filename);
  if (!info.isFile()) throw fail(404, 'Document introuvable.');
  return { filename, info };
};

const resolveSource = async (source) => {
  const prefix = source.startsWith('/user-documents/') && userRoot
    ? '/user-documents/' : '/documents/';
  if (!source.startsWith(prefix)) throw fail(400, 'Document non pris en charge.');
  let relative;
  try { relative = decodeURIComponent(source.slice(prefix.length)); }
  catch { throw fail(400, 'Chemin de document invalide.'); }
  return { ...await resolveDocument(relative, prefix === '/documents/' ? root : userRoot), relative };
};

// Discovery is the source of the browser entry point; its hash changes on updates.
const discoverAction = async (extension) => {
  const response = await fetch(`${collabora}/hosting/discovery`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw fail(503, 'Le service de documents est indisponible.');
  const xml = await response.text();
  const actions = [...xml.matchAll(/<action\b[^>]*\/?\s*>/g)].map(([tag]) => {
    const attrs = {};
    for (const [, name, value] of tag.matchAll(/([\w-]+)="([^"]*)"/g)) {
      attrs[name] = value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    }
    return attrs;
  });
  const action = actions.find((item) => item.ext === extension && item.name === 'view')
    || actions.find((item) => item.ext === extension && item.name === 'edit');
  if (!action?.urlsrc) throw fail(415, 'Ce format ne peut pas être affiché par Collabora.');
  const url = new URL(action.urlsrc.replace(/<[^>]*>/g, ''), collabora);
  // Use the same-origin reverse proxy, never a Docker hostname in the browser.
  return new URL(`${url.pathname}${url.search}`, 'http://portfolio.invalid');
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://documents');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') throw fail(405, 'Lecture seule.');

    if (url.pathname === '/healthz') {
      response.end('ok');
      return;
    }

    if (url.pathname === '/api/office/open') {
      const source = url.searchParams.get('path') || '';
      const { relative } = await resolveSource(source);
      const id = Buffer.from(source).toString('base64url');
      const expiry = Date.now() + lifetime;
      const action = await discoverAction(officeExtension(relative));
      action.searchParams.set('WOPISrc', `${wopiBase}/wopi/files/${id}`);
      action.searchParams.set('permission', 'readonly');
      action.searchParams.set('lang', 'fr');
      const nonce = randomBytes(18).toString('base64');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'self'`);
      response.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Lecture du document</title>
        <form method="post" action="${escapeHtml(action.pathname + action.search)}">
          <input type="hidden" name="access_token" value="${escapeHtml(issueToken(id, expiry))}">
          <input type="hidden" name="access_token_ttl" value="${expiry}">
          <noscript><button>Ouvrir le document</button></noscript>
        </form><script nonce="${nonce}">document.forms[0].submit();</script></html>`);
      return;
    }

    const match = url.pathname.match(/^\/wopi\/files\/([A-Za-z0-9_-]+)(\/contents)?$/);
    if (!match) throw fail(404, 'Page introuvable.');
    const [, id, contents] = match;
    if (!validToken(id, url.searchParams.get('access_token'))) throw fail(401, 'Session expirée ou invalide.');
    const source = Buffer.from(id, 'base64url').toString('utf8');
    const { filename, info, relative } = await resolveSource(source);
    if (contents) {
      response.setHeader('Content-Type', officeTypes[officeExtension(relative)]);
      response.setHeader('Content-Length', info.size);
      await pipeline(createReadStream(filename), response);
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      BaseFileName: path.basename(filename),
      OwnerId: 'portfolio',
      UserId: 'visitor',
      UserFriendlyName: 'Visiteur',
      Size: info.size,
      Version: createHash('sha256').update(`${info.size}:${info.mtimeMs}`).digest('hex'),
      LastModifiedTime: info.mtime.toISOString(),
      UserCanWrite: false,
      ReadOnly: true,
      SupportsUpdate: false,
      SupportsLocks: false,
      UserCanNotWriteRelative: true,
    }));
  } catch (error) {
    if (response.headersSent) { response.destroy(); return; }
    response.statusCode = error.status || (error.code === 'ENOENT' ? 404 : 503);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end(error.status ? error.message : response.statusCode === 404
      ? 'Document introuvable.' : 'Le service de documents est indisponible. Réessayez dans quelques instants.');
  }
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
