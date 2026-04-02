import { contextBridge, ipcRenderer } from "electron";

document.documentElement.dataset.esDesktop = "1";

contextBridge.exposeInMainWorld("esDesktop", {
  isDesktop: true,
  platform: process.platform,
  pickRecentPath: () => ipcRenderer.invoke("desktop:pick-recent-path"),
  pickGameRoot: () => ipcRenderer.invoke("desktop:pick-game-root"),
});
