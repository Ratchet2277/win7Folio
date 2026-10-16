import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const listen = async (server) => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};

test('WOPI serves public documents with file-bound, read-only sessions', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'win7folio-wopi-'));
  const root = path.join(directory, 'documents');
  const userRoot = path.join(directory, 'user-documents');
  await mkdir(root);
  await mkdir(userRoot);
  await writeFile(path.join(userRoot, 'CV été.docx'), 'user document');
  await writeFile(path.join(root, 'CV été.docx'), 'test document');
  await writeFile(path.join(root, 'other.docx'), 'other document');
  await writeFile(path.join(directory, 'private.docx'), 'private document');
  await symlink(path.join(directory, 'private.docx'), path.join(root, 'outside.docx'));

  const discovery = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/xml');
    response.end(`<wopi-discovery><net-zone><app name="writer">
      <action name="edit" ext="docx" urlsrc="http://collabora:9980/browser/hash/cool.html?&amp;&lt;lang=UI_LLCC&amp;&gt;"/>
      </app></net-zone></wopi-discovery>`);
  });
  const discoveryPort = await listen(discovery);
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    env: { ...process.env, DOCUMENTS_ROOT: root, USER_DOCUMENTS_ROOT: userRoot, PORT: String(port),
      COLLABORA_INTERNAL_URL: `http://127.0.0.1:${discoveryPort}` },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await new Promise((resolve) => discovery.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { ready = (await fetch(`${base}/healthz`)).ok; } catch { /* starting */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.ok(ready, diagnostics);
  const open = (source) => fetch(`${base}/api/office/open?path=${encodeURIComponent(source)}`);
  const response = await open('/documents/CV%20%C3%A9t%C3%A9.docx');
  assert.equal(response.status, 200);
  const html = await response.text();
  const action = new URL(html.match(/action="([^"]+)"/)[1].replaceAll('&amp;', '&'), base);
  const token = html.match(/name="access_token" value="([^"]+)"/)[1];
  const wopi = new URL(action.searchParams.get('WOPISrc'));
  const file = `${base}${wopi.pathname}?access_token=${encodeURIComponent(token)}`;

  await t.test('launches same-origin Collabora with read-only permission', () => {
    assert.equal(action.origin, base);
    assert.equal(action.pathname, '/browser/hash/cool.html');
    assert.equal(action.searchParams.get('permission'), 'readonly');
    assert.equal(action.searchParams.get('lang'), 'fr');
    assert.match(response.headers.get('content-security-policy'), /form-action 'self'/);
  });
  await t.test('CheckFileInfo declares read-only permissions', async () => {
    const info = await (await fetch(file)).json();
    assert.equal(info.BaseFileName, 'CV été.docx');
    assert.equal(info.UserCanWrite, false);
    assert.equal(info.ReadOnly, true);
    assert.equal(info.SupportsUpdate, false);
    assert.equal(info.Size, 13);
  });
  await t.test('GetFile transfers the exact file bytes', async () => {
    const result = await fetch(`${base}${wopi.pathname}/contents?access_token=${encodeURIComponent(token)}`);
    assert.equal(result.status, 200);
    assert.equal(await result.text(), 'test document');
    assert.match(result.headers.get('content-type'), /wordprocessingml/);
  });
  await t.test('write requests are rejected', async () => {
    assert.equal((await fetch(file, { method: 'POST', body: 'overwrite' })).status, 405);
  });
  await t.test('missing and forged tokens are rejected', async () => {
    assert.equal((await fetch(`${base}${wopi.pathname}`)).status, 401);
    assert.equal((await fetch(`${file}tampered`)).status, 401);
  });
  await t.test('a token cannot be reused for another file', async () => {
    const id = Buffer.from('/documents/other.docx').toString('base64url');
    assert.equal((await fetch(`${base}/wopi/files/${id}?access_token=${token}`)).status, 401);
  });
  await t.test('User/Document is served independently of public documents', async () => {
    const result = await open('/user-documents/CV%20%C3%A9t%C3%A9.docx');
    assert.equal(result.status, 200);
    const markup = await result.text();
    const actionUrl = new URL(markup.match(/action="([^"]+)"/)[1].replaceAll('&amp;', '&'), base);
    const documentUrl = new URL(actionUrl.searchParams.get('WOPISrc'));
    const userToken = markup.match(/name="access_token" value="([^"]+)"/)[1];
    const contents = await fetch(`${base}${documentUrl.pathname}/contents?access_token=${userToken}`);
    assert.equal(contents.status, 200);
    assert.equal(await contents.text(), 'user document');
    assert.equal((await fetch(`${base}${documentUrl.pathname}?access_token=${token}`)).status, 401);
    assert.equal((await open('/user-documents/../documents/CV%20%C3%A9t%C3%A9.docx')).status, 403);
  });
  await t.test('missing files, unsupported formats and external URLs are rejected', async () => {
    assert.equal((await open('/documents/missing.docx')).status, 404);
    assert.equal((await open('/documents/script.js')).status, 400);
    assert.equal((await open('https://other.example/document.docx')).status, 400);
  });
  await t.test('directory traversal and escaping symlinks are rejected', async () => {
    assert.equal((await open('/documents/../private.docx')).status, 403);
    assert.equal((await open('/documents/%2e%2e/private.docx')).status, 403);
    assert.equal((await open('/documents/outside.docx')).status, 403);
  });
  await t.test('an unreachable Collabora produces a readable error', async () => {
    await new Promise((resolve) => discovery.close(resolve));
    const result = await open('/documents/CV été.docx');
    assert.equal(result.status, 503);
    assert.match(await result.text(), /indisponible/);
  });
});
