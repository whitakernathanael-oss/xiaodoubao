import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { createApplicationRuntime, type ApplicationRuntime } from "./main/app-services";
import { registerIpcHandlers } from "./main/ipc-handlers";

let mainWindow: BrowserWindow | undefined;
let runtime: ApplicationRuntime | undefined;
let removeHandlers: (() => void) | undefined;
const guardianMode = process.argv.includes("--skin-guardian");

app.disableHardwareAcceleration();

function handleSquirrelEvent(): boolean {
  if (process.platform !== "win32") return false;
  const event = process.argv[1];
  if (!event?.startsWith("--squirrel-")) return false;
  const applicationFolder = path.dirname(process.execPath);
  const updateExe = path.resolve(applicationFolder, "..", "Update.exe");
  let commands: string[][] = [];
  if (event === "--squirrel-install" || event === "--squirrel-updated") {
    commands = [["--removeShortcut", "豆包皮肤版.exe"], ["--createShortcut", "小豆包.exe"]];
  } else if (event === "--squirrel-uninstall") {
    commands = [["--removeShortcut", "小豆包.exe"], ["--removeShortcut", "豆包皮肤版.exe"]];
  }
  for (const args of commands) {
    try {
      const child = spawn(updateExe, args, { detached: true, stdio: "ignore", windowsHide: true });
      child.unref();
    } catch { /* Shortcut migration is best-effort. */ }
  }
  setTimeout(() => app.quit(), 800);
  return true;
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: "小豆包",
    icon: path.join(app.getAppPath(), "assets", "icon.ico"),
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
    if (runtime?.persistenceEnabled()) {
      event.preventDefault();
      window.hide();
      return;
    }
    if (!runtime?.workflow.hasActiveSessions()) return;
    const choice = dialog.showMessageBoxSync(window, {
      type: "question",
      title: "退出小豆包",
      message: "退出后豆包页面重新加载时不会自动恢复皮肤。仍要退出吗？",
      buttons: ["取消", "仍要退出"],
      defaultId: 0,
      cancelId: 0
    });
    if (choice === 0) event.preventDefault();
  });
  return window;
}

if (!handleSquirrelEvent()) {
  app.whenReady().then(async () => {
    runtime = await createApplicationRuntime();
    if (guardianMode) {
      if (!await runtime.startGuardian()) app.quit();
      return;
    }
    removeHandlers = registerIpcHandlers(runtime.services, ipcMain);
    mainWindow = createWindow();
    app.on("activate", () => {
      if (!mainWindow) mainWindow = createWindow();
      else { mainWindow.show(); mainWindow.focus(); }
    });
  }).catch((error) => {
    dialog.showErrorBox("小豆包启动失败", error instanceof Error ? error.message : String(error));
    app.quit();
  });
}

app.on("before-quit", () => {
  removeHandlers?.();
  runtime?.dispose();
});

app.on("window-all-closed", () => {
  if (!runtime?.persistenceEnabled()) app.quit();
});
