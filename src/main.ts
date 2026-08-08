import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { createApplicationRuntime, type ApplicationRuntime } from "./main/app-services";
import { registerIpcHandlers } from "./main/ipc-handlers";

let mainWindow: BrowserWindow | undefined;
let runtime: ApplicationRuntime | undefined;
let removeHandlers: (() => void) | undefined;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: "豆包皮肤版",
    backgroundColor: "#efeff3",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.js")
    }
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else void window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  window.on("close", (event) => {
    if (!runtime?.workflow.hasActiveSessions()) return;
    const choice = dialog.showMessageBoxSync(window, {
      type: "question",
      title: "退出豆包皮肤版",
      message: "退出后豆包页面重新加载时不会自动恢复皮肤。仍要退出吗？",
      buttons: ["取消", "仍要退出"],
      defaultId: 0,
      cancelId: 0
    });
    if (choice === 0) event.preventDefault();
  });
  return window;
}

app.whenReady().then(async () => {
  runtime = await createApplicationRuntime();
  removeHandlers = registerIpcHandlers(runtime.services, ipcMain);
  mainWindow = createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
}).catch((error) => {
  dialog.showErrorBox("豆包皮肤版启动失败", error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("before-quit", () => {
  removeHandlers?.();
  runtime?.dispose();
});

app.on("window-all-closed", () => app.quit());
