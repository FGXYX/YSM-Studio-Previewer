const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

// This previewer runs on machines where Chromium's sandbox can fail before
// the first window is created (especially under restricted Windows profiles).
// Apply the switches as early as possible for double-click launches.
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ysm',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function createWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f4eaed',
    title: 'YSM Studio Previewer',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#fbf7f8',
      symbolColor: '#5d4853',
      height: 42,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.setMenuBarVisibility(false);
  if (isDev) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadURL('ysm://app/index.html');
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  return window;
}

async function scanDirectory(rootPath) {
  const files = [];
  const root = path.resolve(rootPath);

  async function walk(current) {
    if (files.length > 20000) throw new Error('文件夹文件数量超过 20000，请缩小模型目录。');
    const items = await fs.readdir(current, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.isFile()) {
        files.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  }

  await walk(root);
  return { rootPath: root, rootName: path.basename(root), files };
}

async function readDirectoryFiles(rootPath, relativePaths) {
  const root = path.resolve(rootPath);
  const files = [];
  for (const relativePath of relativePaths) {
    const full = path.resolve(root, relativePath);
    if (!full.toLowerCase().startsWith(`${root.toLowerCase()}${path.sep}`)) {
      throw new Error(`非法路径：${relativePath}`);
    }
    const content = await fs.readFile(full);
    files.push({
      path: relativePath.split(path.sep).join('/'),
      data: new Uint8Array(content),
    });
  }
  return files;
}

app.whenReady().then(() => {
  const distRoot = path.join(__dirname, '..', 'dist');
  protocol.handle('ysm', async (request) => {
    try {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const target = path.resolve(distRoot, `.${pathname}`);
      if (!target.toLowerCase().startsWith(distRoot.toLowerCase())) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = await fs.readFile(target);
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': mimeType(target),
          'cache-control': 'no-cache',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  const window = createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  return window;
});

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.wasm': 'application/wasm',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.avif': 'image/avif',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.woff2': 'font/woff2',
    }[ext] ?? 'application/octet-stream'
  );
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:open-files', async () => {
  const result = await dialog.showOpenDialog({
    title: '导入 Yes Steve Model',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Yes Steve Model', extensions: ['ysm'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:open-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择模型文件夹',
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('fs:read-file', async (_event, filePath) => {
  const data = await fs.readFile(filePath);
  return { name: path.basename(filePath), data: new Uint8Array(data) };
});

ipcMain.handle('fs:scan-directory', async (_event, directoryPath) => {
  return scanDirectory(directoryPath);
});

ipcMain.handle('fs:read-directory-files', async (_event, rootPath, relativePaths) => {
  return readDirectoryFiles(rootPath, relativePaths);
});

ipcMain.handle('app:set-zoom-factor', (event, factor) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const value = Math.min(1.4, Math.max(0.8, Number(factor) || 1));
  window?.webContents.setZoomFactor(value);
  return value;
});

ipcMain.handle('app:set-theme', (event, theme) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  const dark = theme === 'dark';
  try {
    window.setTitleBarOverlay({
      color: dark ? '#0f0d0b' : '#fbf7f8',
      symbolColor: dark ? '#c8bfb0' : '#5d4853',
      height: 42,
    });
  } catch {
    // setTitleBarOverlay is Windows-only.
  }
});

ipcMain.handle('app:open-external', async (_event, url) => {
  if (typeof url !== 'string') return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && parsed.hostname === 'github.com') {
      await shell.openExternal(url);
    }
  } catch {
    // Ignore malformed links.
  }
});

ipcMain.handle('app:show-in-folder', async (_event, targetPath) => {
  if (targetPath) shell.showItemInFolder(targetPath);
});
