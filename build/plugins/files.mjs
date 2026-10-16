import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
// eslint-disable-next-line import/no-extraneous-dependencies
import datauri from 'datauri/sync.js';
import { isOfficeDocument } from '../../shared/office.mjs';

let filesDir;

const getDirFiles = (dir) => fs.readdirSync(dir)
  .filter((entry) => !['.gitkeep', '.files'].includes(entry))
  .map((entry) => path.resolve(dir, entry));

const realPathToAppPath = (filePath) => filePath.replace(`${filesDir}/`, '');
const getFileHash = (filePath) => `x${createHash('md5').update(filePath).digest('hex')}`;

const getConvertDataType = (filePath) => {
  const appPath = realPathToAppPath(filePath);
  const extension = path.extname(appPath);
  if (appPath === 'C:/Windows/system/window/boot.mp4') return 'url';
  if (['.gif', '.jpg', '.jpeg', '.png', '.mp3', '.wav', '.mp4', '.mkv', '.avi'].includes(extension)) {
    if (appPath.startsWith('C:')) {
      if (!appPath.startsWith('C:/Windows/system/wallpapers')
        || appPath === 'C:/Windows/system/wallpapers/01.jpg') return 'datauri';
    }
    return 'url';
  }
  if (extension === '.js') return '';
  return 'content';
};

const calculateFilesModule = () => {
  const imports = [];
  const exports = [];
  const loadFiles = (directory) => {
    getDirFiles(directory).forEach((filePath) => {
      const stat = fs.lstatSync(filePath);
      const appPath = realPathToAppPath(filePath);
      if (stat.isDirectory()) {
        exports.push({ type: 'directory', path: appPath });
        loadFiles(filePath);
        return;
      }
      if (appPath.startsWith('C:/User/Document/') && isOfficeDocument(appPath)) {
        const relative = appPath.slice('C:/User/Document/'.length);
        exports.push({
          type: 'file',
          path: appPath,
          data: JSON.stringify(`/user-documents/${relative.split('/').map(encodeURIComponent).join('/')}`),
        });
        return;
      }
      const variableName = getFileHash(filePath);
      if (!filePath.endsWith('.vue')) {
        const dataType = getConvertDataType(filePath);
        if (dataType === 'datauri') filePath += '?datauri';
        else if (dataType === 'url') filePath += '?url';
        else if (dataType === 'content') filePath += '?raw';
        else {
          exports.push({
            type: 'file',
            path: appPath,
            data: `'${fs.readFileSync(filePath).toString().replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`,
          });
          return;
        }
      }
      imports.push({ name: variableName, from: filePath });
      exports.push({ type: filePath.endsWith('.vue') ? 'app' : 'file', path: appPath, data: variableName });
    });
  };
  loadFiles(filesDir);
  const documentsDir = path.resolve(filesDir, '../public/documents');
  const addDocumentDirectory = (directory) => {
    if (!exports.some((entry) => entry.path === directory)) {
      exports.push({ type: 'directory', path: directory });
    }
  };
  const loadDocuments = (directory, segments = []) => {
    const virtualPath = ['C:/User/Documents', ...segments].join('/');
    addDocumentDirectory(virtualPath);
    if (!fs.existsSync(directory)) return;
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const parts = [...segments, entry.name];
      if (entry.isDirectory()) {
        loadDocuments(path.join(directory, entry.name), parts);
      } else if (entry.isFile() && isOfficeDocument(entry.name)) {
        exports.push({
          type: 'file',
          path: ['C:/User/Documents', ...parts].join('/'),
          data: JSON.stringify(`/documents/${parts.map(encodeURIComponent).join('/')}`),
        });
      }
    });
  };
  loadDocuments(documentsDir);
  return {
    code: `${imports.map((item) => `import ${item.name} from ${JSON.stringify(item.from)};`).join(' ')}export default [${exports.map((item) => `
      { type: ${JSON.stringify(item.type)}, path: ${JSON.stringify(item.path)}, data: ${item.data} }`).join(',')}]`,
    map: null,
  };
};

export default () => ({
  name: 'files',
  configureServer(server) {
    const modulePath = path.resolve(server.config.root, 'src/.files');
    const documentsPath = `${path.resolve(server.config.root, 'public/documents')}${path.sep}`;
    const userDocumentsPath = `${path.resolve(server.config.root, 'src/C:/User/Document')}${path.sep}`;
    const refreshDocuments = (filename) => {
      if ((!filename.startsWith(documentsPath) && !filename.startsWith(userDocumentsPath))
        || !isOfficeDocument(filename)) return;
      const module = server.moduleGraph.getModuleById(modulePath);
      if (module) server.moduleGraph.invalidateModule(module);
      server.ws.send({ type: 'full-reload' });
    };
    server.watcher.on('add', refreshDocuments);
    server.watcher.on('unlink', refreshDocuments);
    server.watcher.on('change', refreshDocuments);
  },
  transform(src, id) {
    if (id.endsWith('.files')) {
      filesDir = path.dirname(id);
      return calculateFilesModule();
    }
    if (/\?datauri$/.test(id) && src.length < 300) {
      return { map: null, code: `export default '${datauri(id.replace('?datauri', '')).content}';` };
    }
    return null;
  },
});
