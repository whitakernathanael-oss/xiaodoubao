import { app, dialog } from "electron";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IpcServices } from "./ipc-handlers";
import { AdapterStore } from "./adapter-store";
import { CdpSession, fetchTargets } from "./cdp";
import {
  closeDoubaoForRestart,
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
import { SkinGuardian } from "./skin-guardian";
import { SkinStateStore } from "./skin-state";
import { reconcileSkinAutomationState, reconcileSkinBackground, shouldKeepSkinBackground } from "./skin-background";
import { installGuardianStartup, removeGuardianStartup, windowsStartupFolder } from "./startup-shortcut";
import { inspectWallpaper, validateWallpaperByteLength } from "./wallpaper-validation";
import type { SaveThemeInput } from "../shared/ipc";
import { detectWallpaperFormat, normalizeWallpaperName } from "../shared/wallpaper-format";

interface AppSettings {
  doubaoExecutable?: string;
  port: number;
  skinPersistenceEnabled: boolean;
  confirmBeforeRestart: boolean;
  skinTemporarilyDisabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = { port: 9225, skinPersistenceEnabled: true, confirmBeforeRestart: true, skinTemporarilyDisabled: false };

class SettingsStore {
  constructor(private readonly file: string) {}

  async load(): Promise<AppSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as Partial<AppSettings>;
      return {
        port: Number.isInteger(parsed.port) && parsed.port! > 0 && parsed.port! <= 65_535 ? parsed.port! : 9225,
        skinPersistenceEnabled: parsed.skinPersistenceEnabled !== false,
        confirmBeforeRestart: parsed.confirmBeforeRestart !== false,
        skinTemporarilyDisabled: parsed.skinTemporarilyDisabled === true,
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

async function existingExecutable(configured?: string): Promise<string | undefined> {
  if (configured) {
    try { await access(configured); return configured; } catch { /* Fall back to standard locations. */ }
  }
  return findDoubaoExecutable();
}

function storedWallpaperMime(file: string): "image/png" | "image/jpeg" | "image/webp" {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
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
  startGuardian(): Promise<boolean>;
  dispose(): void;
  persistenceEnabled(): boolean;
}

export async function createApplicationRuntime(): Promise<ApplicationRuntime> {
  const data = resolveDataPaths();
  const bundled = resolveBundledPaths(app.isPackaged, app.getAppPath(), process.resourcesPath);
  const settingsStore = new SettingsStore(data.settings);
  let settings = await settingsStore.load();
  const skinState = new SkinStateStore(data.activeSkin);
  let persistenceActive = Boolean(await skinState.load());
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
  const restartRunningDoubao = async (port: number): Promise<boolean> => {
    if (!await closeDoubaoForRestart()) return false;
    const executable = await existingExecutable(settings.doubaoExecutable);
    if (!executable) return false;
    const adapter = await adapterStore.load();
    launchDoubao(executable, port);
    return waitForPort(port, adapter);
  };
  const guardian = new SkinGuardian({
    loadState: () => settings.skinTemporarilyDisabled ? Promise.resolve(undefined) : skinState.load(),
    probe: async (port) => probeDoubaoPort(port, await adapterStore.load()),
    launch: launchDoubao,
    apply: (id, port) => workflow.apply(id, port),
    shouldRestartRunningDoubao: () => !settings.confirmBeforeRestart && !settings.skinTemporarilyDisabled,
    restartRunningDoubao,
    rollback: (id) => workflow.restoreThemeIfActive(id),
    delay: (milliseconds, callback) => setTimeout(callback, milliseconds),
    cancel: clearTimeout
  });
  const manageStartup = app.isPackaged && process.platform === "win32";
  const reconcileBackground = async (startGuardian: () => void | Promise<void> = () => guardian.start()): Promise<void> => {
    await reconcileSkinBackground({
      temporarilyDisabled: settings.skinTemporarilyDisabled,
      shouldRun: shouldKeepSkinBackground(settings.skinPersistenceEnabled, persistenceActive, settings.skinTemporarilyDisabled),
      manageStartup
    }, {
      stopGuardian: () => guardian.stop(),
      startGuardian,
      installStartup: () => installGuardianStartup(process.execPath, windowsStartupFolder()),
      removeStartup: () => removeGuardianStartup(windowsStartupFolder()),
      reportError: (error) => log.write({
        stage: "skin-background",
        errorType: error instanceof Error ? error.name : "unknown",
        status: "failed"
      })
    });
  };

  const removePersistence = async (): Promise<void> => {
    guardian.stop();
    workflow.dispose();
    await skinState.disable();
    persistenceActive = false;
    if (app.isPackaged && process.platform === "win32") await removeGuardianStartup(windowsStartupFolder());
  };

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
    if (settings.skinTemporarilyDisabled) return { kind: "disabled", message: "皮肤已暂时停用" };
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

  const loadWallpaper = async (id: string) => {
    const asset = (await themeStore.readBundle(id)).asset;
    return { name: asset.name, mime: storedWallpaperMime(asset.name), bytes: asset.bytes };
  };

  const services: IpcServices = {
    listThemes: () => themeStore.list(),
    loadTheme: (id) => themeStore.load(id),
    loadWallpaper,
    saveTheme,
    deleteTheme: async (id) => {
      const active = await skinState.load();
      if (active?.themeId === id) await removePersistence();
      await themeStore.remove(id);
    },
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
      validateWallpaperByteLength((await stat(file)).size);
      const bytes = await readFile(file);
      const format = detectWallpaperFormat(bytes);
      if (!format) throw new Error("选择的文件不是受支持的图片");
      const name = normalizeWallpaperName(path.basename(file), format);
      inspectWallpaper(name, bytes);
      return {
        name,
        mime: format.mime,
        bytes
      };
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
      if (settings.skinTemporarilyDisabled) return { kind: "disabled", message: "皮肤已暂时停用" };
      if (settings.confirmBeforeRestart) {
        const response = await dialog.showMessageBox({
          type: "warning", title: "重启豆包",
          message: "豆包未以皮肤模式启动。关闭并重新启动豆包以恢复皮肤？",
          detail: "豆包中未发送的文字可能丢失。",
          buttons: ["取消", "关闭并重启"], defaultId: 0, cancelId: 0
        });
        if (response.response !== 1) return { kind: "restart-required" };
      }
      return await restartRunningDoubao(port) ? { kind: "connecting" } : { kind: "error", reason: "close-failed" };
    },
    applyTheme: async (id) => {
      if (settings.skinTemporarilyDisabled) return { kind: "disabled", message: "皮肤已暂时停用" };
      const result = await workflow.apply(id, settings.port);
      if ((result.kind === "applied" || result.kind === "partial") && settings.skinPersistenceEnabled) {
        const executable = await existingExecutable(settings.doubaoExecutable);
        if (executable) {
          await skinState.save({ version: 1, themeId: id, port: settings.port, doubaoExecutable: executable, updatedAt: new Date().toISOString() });
          persistenceActive = true;
          await reconcileBackground(() => guardian.startAlreadyApplied());
        } else {
          await removePersistence();
          return { kind: "error", reason: "doubao-not-found" };
        }
      }
      return result;
    },
    restoreOfficial: async () => {
      settings = { ...settings, skinPersistenceEnabled: false };
      await settingsStore.save(settings);
      await removePersistence();
      await workflow.restore(settings.port);
    },
    getSkinPersistence: async () => ({ enabled: settings.skinPersistenceEnabled }),
    setSkinPersistence: async (enabled) => {
      settings = { ...settings, skinPersistenceEnabled: enabled };
      await settingsStore.save(settings);
      if (!enabled) await removePersistence();
      return { enabled };
    },
    getSkinAutomation: async () => ({ confirmBeforeRestart: settings.confirmBeforeRestart, temporarilyDisabled: settings.skinTemporarilyDisabled }),
    setSkinAutomation: async (patch) => {
      settings = { ...settings, ...patch };
      await settingsStore.save(settings);
      persistenceActive = await reconcileSkinAutomationState({
        temporarilyDisabled: settings.skinTemporarilyDisabled,
        persistenceEnabled: settings.skinPersistenceEnabled,
        activeSkinExists: persistenceActive,
        manageStartup
      }, async () => Boolean(await skinState.load()), {
        stopGuardian: () => guardian.stop(),
        startGuardian: () => guardian.start(),
        installStartup: () => installGuardianStartup(process.execPath, windowsStartupFolder()),
        removeStartup: () => removeGuardianStartup(windowsStartupFolder()),
        reportError: (error) => log.write({
          stage: "skin-background",
          errorType: error instanceof Error ? error.name : "unknown",
          status: "failed"
        })
      });
      return { confirmBeforeRestart: settings.confirmBeforeRestart, temporarilyDisabled: settings.skinTemporarilyDisabled };
    },
    chooseDoubaoExecutable: chooseExecutable
  };
  return {
    services,
    workflow,
    startGuardian: async (): Promise<boolean> => {
      if (!shouldKeepSkinBackground(settings.skinPersistenceEnabled, persistenceActive, settings.skinTemporarilyDisabled)) return false;
      await guardian.start();
      return true;
    },
    persistenceEnabled: () => shouldKeepSkinBackground(settings.skinPersistenceEnabled, persistenceActive, settings.skinTemporarilyDisabled),
    dispose: () => { guardian.stop(); workflow.dispose(); }
  };
}
