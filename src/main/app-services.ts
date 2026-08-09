import { app, dialog } from "electron";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IpcServices } from "./ipc-handlers";
import { AdapterStore } from "./adapter-store";
import { CdpSession, fetchTargets } from "./cdp";
import {
  closeDoubaoGracefully,
  findDoubaoExecutable,
  launchDoubao,
  probeDoubaoPort
} from "./doubao-launcher";
import { Injector } from "./injector";
import { PrivacyLog } from "./log";
import { resolveBundledPaths, resolveDataPaths } from "./paths";
import { ThemeArchive } from "./theme-archive";
import { ThemeStore } from "./theme-store";
import { SkinWorkflow } from "./workflow";
import type { SaveThemeInput, WallpaperSelection } from "../shared/ipc";

interface AppSettings {
  doubaoExecutable?: string;
  port: number;
}

const DEFAULT_SETTINGS: AppSettings = { port: 9225 };

class SettingsStore {
  constructor(private readonly file: string) {}

  async load(): Promise<AppSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as Partial<AppSettings>;
      return {
        port: Number.isInteger(parsed.port) && parsed.port! > 0 && parsed.port! <= 65_535 ? parsed.port! : 9225,
        ...(typeof parsed.doubaoExecutable === "string" ? { doubaoExecutable: parsed.doubaoExecutable } : {})
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return { ...DEFAULT_SETTINGS };
      throw error;
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
      await rm(this.file, { force: true });
      await rename(temporary, this.file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}

function wallpaperMime(file: string): WallpaperSelection["mime"] {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

async function existingExecutable(configured?: string): Promise<string | undefined> {
  if (configured) {
    try { await access(configured); return configured; } catch { /* Fall back to standard locations. */ }
  }
  return findDoubaoExecutable();
}

async function waitForPort(port: number, adapter: Awaited<ReturnType<AdapterStore["load"]>>): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { if ((await fetchTargets(port, adapter)).length > 0) return true; } catch { /* Still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export interface ApplicationRuntime {
  services: IpcServices;
  workflow: SkinWorkflow;
  dispose(): void;
}

export async function createApplicationRuntime(): Promise<ApplicationRuntime> {
  const data = resolveDataPaths();
  const bundled = resolveBundledPaths(app.isPackaged, app.getAppPath(), process.resourcesPath);
  const settingsStore = new SettingsStore(data.settings);
  let settings = await settingsStore.load();
  const themeStore = new ThemeStore(data.themes, bundled.themes);
  const adapterStore = new AdapterStore(data.adapter, bundled.adapter);
  const archive = new ThemeArchive(themeStore);
  const log = new PrivacyLog(data.log);
  const workflow = new SkinWorkflow({
    loadBundle: (id) => themeStore.readBundle(id),
    loadAdapter: () => adapterStore.load(),
    fetchTargets,
    connect: (url) => CdpSession.connect(url),
    createInjector: (session, adapter) => new Injector(session, adapter),
    log
  });

  const chooseExecutable = async (): Promise<string | undefined> => {
    const result = await dialog.showOpenDialog({
      title: "选择豆包程序",
      properties: ["openFile"],
      filters: [{ name: "豆包程序", extensions: ["exe"] }]
    });
    const executable = result.canceled ? undefined : result.filePaths[0];
    if (executable) {
      settings = { ...settings, doubaoExecutable: executable };
      await settingsStore.save(settings);
    }
    return executable;
  };

  const start = async (port: number): Promise<unknown> => {
    settings = { ...settings, port };
    await settingsStore.save(settings);
    const adapter = await adapterStore.load();
    const probe = await probeDoubaoPort(port, adapter);
    if (probe.kind === "connected") return { kind: "connecting" };
    if (probe.kind === "restart-required") return { kind: "restart-required" };
    if (probe.kind === "port-conflict") return { kind: "error", reason: "port-conflict" };
    const executable = await existingExecutable(settings.doubaoExecutable);
    if (!executable) return { kind: "error", reason: "doubao-not-found" };
    launchDoubao(executable, port);
    return await waitForPort(port, adapter) ? { kind: "connecting" } : { kind: "error", reason: "startup-timeout" };
  };

  const saveTheme = async (input: SaveThemeInput) => {
    let asset;
    let previousCss: string | undefined;
    if (input.wallpaper) {
      asset = { name: input.wallpaper.name, bytes: input.wallpaper.bytes };
      try { previousCss = (await themeStore.readBundle(input.theme.id)).extraCss; } catch { /* New theme. */ }
    } else {
      const previous = await themeStore.readBundle(input.theme.id);
      asset = previous.asset;
      previousCss = previous.extraCss;
    }
    return themeStore.save(input.theme, asset, input.extraCss ?? previousCss);
  };

  const services: IpcServices = {
    listThemes: () => themeStore.list(),
    loadTheme: (id) => themeStore.load(id),
    saveTheme,
    deleteTheme: (id) => themeStore.remove(id),
    duplicateTheme: (id) => themeStore.duplicate(id),
    importTheme: async () => {
      const result = await dialog.showOpenDialog({
        title: "导入主题 ZIP",
        properties: ["openFile"],
        filters: [{ name: "ZIP 主题包", extensions: ["zip"] }]
      });
      return result.canceled ? undefined : archive.importThemeZip(await readFile(result.filePaths[0]));
    },
    exportTheme: async (id) => {
      const result = await dialog.showSaveDialog({
        title: "导出主题 ZIP",
        defaultPath: `${id}.zip`,
        filters: [{ name: "ZIP 主题包", extensions: ["zip"] }]
      });
      if (result.canceled || !result.filePath) return false;
      await writeFile(result.filePath, await archive.exportThemeZip(id));
      return true;
    },
    chooseWallpaper: async () => {
      const result = await dialog.showOpenDialog({
        title: "选择静态壁纸",
        properties: ["openFile"],
        filters: [{ name: "静态图片", extensions: ["png", "jpg", "jpeg", "webp"] }]
      });
      if (result.canceled) return undefined;
      const file = result.filePaths[0];
      return { name: path.basename(file), mime: wallpaperMime(file), bytes: await readFile(file) };
    },
    getStatus: async () => {
      if (workflow.hasActiveSessions()) return workflow.getStatus();
      const probe = await probeDoubaoPort(settings.port, await adapterStore.load());
      if (probe.kind === "restart-required") return { kind: "restart-required" };
      if (probe.kind === "connected") return { kind: "connecting" };
      if (probe.kind === "port-conflict") return { kind: "error", reason: "port-conflict" };
      return { kind: "not-running" };
    },
    startDoubao: start,
    confirmRestart: async (port) => {
      const response = await dialog.showMessageBox({
        type: "warning",
        title: "重启豆包",
        message: "请先从系统托盘正常退出豆包。",
        detail: "保存未完成的内容，在任务栏右下角右键豆包图标，选择“退出”。完成后回到这里继续；工具不会强制结束进程。",
        buttons: ["取消", "已退出豆包，继续"],
        defaultId: 0,
        cancelId: 0
      });
      if (response.response !== 1) return { kind: "restart-required" };
      if (!await closeDoubaoGracefully(true)) return { kind: "error", reason: "graceful-close-failed" };
      const executable = await existingExecutable(settings.doubaoExecutable);
      if (!executable) return { kind: "error", reason: "doubao-not-found" };
      const adapter = await adapterStore.load();
      launchDoubao(executable, port);
      return await waitForPort(port, adapter) ? { kind: "connecting" } : { kind: "error", reason: "startup-timeout" };
    },
    applyTheme: (id) => workflow.apply(id, settings.port),
    restoreOfficial: () => workflow.restore(settings.port),
    chooseDoubaoExecutable: chooseExecutable
  };
  return { services, workflow, dispose: () => workflow.dispose() };
}
