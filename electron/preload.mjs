import { contextBridge, ipcRenderer } from "electron";

document.documentElement.dataset.esDesktop = "1";

contextBridge.exposeInMainWorld("esDesktop", {
  isDesktop: true,
  platform: process.platform,
  pickRecentPath: () => ipcRenderer.invoke("desktop:pick-recent-path"),
  pickGameRoot: () => ipcRenderer.invoke("desktop:pick-game-root"),
  pickConfigImportPath: () => ipcRenderer.invoke("desktop:pick-config-import-path"),
  pickConfigExportPath: () => ipcRenderer.invoke("desktop:pick-config-export-path"),
});
