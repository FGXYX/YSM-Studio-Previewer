const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ysmNative', {
  platform: process.platform,
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
  openFiles: () => ipcRenderer.invoke('dialog:open-files'),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),
  scanDirectory: (directoryPath) => ipcRenderer.invoke('fs:scan-directory', directoryPath),
  readDirectoryFiles: (rootPath, relativePaths) =>
    ipcRenderer.invoke('fs:read-directory-files', rootPath, relativePaths),
  setZoomFactor: (factor) => ipcRenderer.invoke('app:set-zoom-factor', factor),
  setTheme: (theme) => ipcRenderer.invoke('app:set-theme', theme),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  showInFolder: (targetPath) => ipcRenderer.invoke('app:show-in-folder', targetPath),
});
