import { isThemeId, validateTheme, type Theme, type ThemeSummary } from "../shared/contracts";
import { IPC_CHANNELS, type SaveThemeInput, type WallpaperSelection } from "../shared/ipc";

type MaybePromise<T> = T | Promise<T>;

export interface IpcServices {
  listThemes(): MaybePromise<ThemeSummary[]>;
  loadTheme(id: string): MaybePromise<Theme>;
  loadWallpaper(id: string): MaybePromise<WallpaperSelection>;
  saveTheme(input: SaveThemeInput): MaybePromise<ThemeSummary>;
  deleteTheme(id: string): MaybePromise<void>;
  duplicateTheme(id: string): MaybePromise<ThemeSummary>;
  importTheme(): MaybePromise<ThemeSummary | undefined>;
  exportTheme(id: string): MaybePromise<boolean>;
  chooseWallpaper(): MaybePromise<WallpaperSelection | undefined>;
  getStatus(): MaybePromise<unknown>;
  startDoubao(port: number): MaybePromise<unknown>;
  confirmRestart(port: number): MaybePromise<unknown>;
  applyTheme(id: string): MaybePromise<unknown>;
  restoreOfficial(): MaybePromise<void>;
  chooseDoubaoExecutable(): MaybePromise<string | undefined>;
}

export interface IpcMainLike {
  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

function themeId(value: unknown): string {
  if (typeof value !== "string" || !isThemeId(value)) throw new Error("Theme id is invalid");
  return value;
}

function port(value: unknown): number {
  const resolved = value === undefined ? 9225 : value;
  if (!Number.isInteger(resolved) || (resolved as number) < 1 || (resolved as number) > 65_535) {
    throw new Error("Remote debugging port is invalid");
  }
  return resolved as number;
}

function wallpaper(value: unknown): WallpaperSelection | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") throw new Error("Wallpaper selection is invalid");
  const item = value as Record<string, unknown>;
  if (typeof item.name !== "string" || item.name.includes("/") || item.name.includes("\\")) {
    throw new Error("Wallpaper filename is invalid");
  }
  if (item.mime !== "image/png" && item.mime !== "image/jpeg" && item.mime !== "image/webp") {
    throw new Error("Wallpaper MIME type is invalid");
  }
  let bytes: Uint8Array;
  if (item.bytes instanceof Uint8Array) bytes = item.bytes;
  else if (item.bytes instanceof ArrayBuffer) bytes = new Uint8Array(item.bytes);
  else if (ArrayBuffer.isView(item.bytes)) bytes = new Uint8Array(item.bytes.buffer, item.bytes.byteOffset, item.bytes.byteLength);
  else throw new Error("Wallpaper bytes are invalid");
  return { name: item.name, mime: item.mime, bytes };
}

function saveInput(value: unknown): SaveThemeInput {
  if (value === null || typeof value !== "object") throw new Error("Theme save request is invalid");
  const item = value as Record<string, unknown>;
  const result = validateTheme(item.theme);
  if (!result.ok) throw new Error(`Theme is invalid: ${result.errors.join("; ")}`);
  if (item.extraCss !== undefined && (typeof item.extraCss !== "string" || item.extraCss.length > 100 * 1024)) {
    throw new Error("extra.css is invalid");
  }
  return {
    theme: result.theme,
    wallpaper: wallpaper(item.wallpaper),
    extraCss: item.extraCss as string | undefined
  };
}

export function registerIpcHandlers(services: IpcServices, ipcMain: IpcMainLike): () => void {
  const handlers: Record<string, (event: unknown, ...args: unknown[]) => unknown> = {
    [IPC_CHANNELS.themeList]: async () => services.listThemes(),
    [IPC_CHANNELS.themeLoad]: async (_event, id) => services.loadTheme(themeId(id)),
    [IPC_CHANNELS.wallpaperLoad]: async (_event, id) => services.loadWallpaper(themeId(id)),
    [IPC_CHANNELS.themeSave]: async (_event, input) => services.saveTheme(saveInput(input)),
    [IPC_CHANNELS.themeDelete]: async (_event, id) => services.deleteTheme(themeId(id)),
    [IPC_CHANNELS.themeDuplicate]: async (_event, id) => services.duplicateTheme(themeId(id)),
    [IPC_CHANNELS.themeImport]: async () => services.importTheme(),
    [IPC_CHANNELS.themeExport]: async (_event, id) => services.exportTheme(themeId(id)),
    [IPC_CHANNELS.wallpaperChoose]: async () => services.chooseWallpaper(),
    [IPC_CHANNELS.adapterStatus]: async () => services.getStatus(),
    [IPC_CHANNELS.doubaoStart]: async (_event, value) => services.startDoubao(port(value)),
    [IPC_CHANNELS.doubaoRestart]: async (_event, value) => services.confirmRestart(port(value)),
    [IPC_CHANNELS.doubaoChooseExecutable]: async () => services.chooseDoubaoExecutable(),
    [IPC_CHANNELS.skinApply]: async (_event, id) => services.applyTheme(themeId(id)),
    [IPC_CHANNELS.skinRestore]: async () => services.restoreOfficial()
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
  return () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
  };
}
