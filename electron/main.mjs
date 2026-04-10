import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

let mainWindow = null;
let serverProcess = null;
let serverPort = null;
let quitting = false;

function getAppRuntimeRoot() {
  if (!app.isPackaged) {
    return app.getAppPath();
  }
  return path.join(process.resourcesPath, "app.asar.unpacked");
}

function getServerEntry() {
  return path.join(getAppRuntimeRoot(), "server.mjs");
}

function getServerCwd() {
  return getAppRuntimeRoot();
}

function getCacheDir() {
  return path.join(app.getPath("userData"), "cache");
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close(() => reject(new Error("Failed to allocate a local port.")));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(port) {
  const deadline = Date.now() + 20000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/healthz`, { cache: "no-store" });
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error("Timed out while waiting for the local server.");
}

async function startServer() {
  if (serverProcess) {
    return;
  }
  serverPort = await getFreePort();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(serverPort),
    ENDLESS_SKY_APP_CACHE_DIR: getCacheDir(),
  };
  serverProcess = spawn(process.execPath, [getServerEntry()], {
    cwd: getServerCwd(),
    env,
    stdio: "inherit",
  });
  serverProcess.once("exit", () => {
    serverProcess = null;
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        "Local server stopped",
        "The ES: Operations backend stopped unexpectedly. Restart the app to continue."
      );
    }
  });
  await waitForServer(serverPort);
}

function stopServer() {
  if (!serverProcess) {
    return;
  }
  const child = serverProcess;
  serverProcess = null;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

async function createWindow() {
  await startServer();
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1220,
    minHeight: 760,
    backgroundColor: "#0b0f1a",
    title: "ES: Operations",
    webPreferences: {
      contextIsolation: true,
      preload: path.join(getAppRuntimeRoot(), "electron", "preload.mjs"),
    },
  });
  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("desktop:pick-recent-path", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose Endless Sky recent.txt",
    properties: ["openFile"],
    filters: [{ name: "Text Files", extensions: ["txt"] }],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("desktop:pick-game-root", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose the Endless Sky game folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("desktop:pick-config-import-path", async () => {
  const result = await dialog.showOpenDialog({
    title: "Import app config",
    properties: ["openFile"],
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("desktop:pick-config-export-path", async () => {
  const result = await dialog.showSaveDialog({
    title: "Export app config",
    defaultPath: "endless-sky-operations-config.json",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
});

app.whenReady().then(async () => {
  await createWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("before-quit", () => {
  quitting = true;
  stopServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
