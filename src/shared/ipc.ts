import type { Theme, ThemeSummary } from "./contracts";

export const IPC_CHANNELS = {
  themeList: "theme:list",
  themeLoad: "theme:load",
  themeSave: "theme:save",
  themeDelete: "theme:delete",
  themeDuplicate: "theme:duplicate",
  themeImport: "theme:import",
  themeExport: "theme:export",
  wallpaperChoose: "wallpaper:choose",
  adapterStatus: "adapter:status",
  doubaoStart: "doubao:start",
  doubaoRestart: "doubao:restart",
  doubaoChooseExecutable: "doubao:choose-executable",
  skinApply: "skin:apply",
  skinRestore: "skin:restore",
  logRead: "log:read"
} as const;

export interface WallpaperSelection {
  name: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  bytes: Uint8Array;
}

export interface SaveThemeInput {
  theme: Theme;
  wallpaper?: WallpaperSelection;
  extraCss?: string;
}

export interface DoubaoSkinApi {
  listThemes(): Promise<ThemeSummary[]>;
  loadTheme(id: string): Promise<Theme>;
  saveTheme(input: SaveThemeInput): Promise<ThemeSummary>;
  deleteTheme(id: string): Promise<void>;
  duplicateTheme(id: string): Promise<ThemeSummary>;
  importTheme(): Promise<ThemeSummary | undefined>;
  exportTheme(id: string): Promise<boolean>;
  chooseWallpaper(): Promise<WallpaperSelection | undefined>;
  getStatus(): Promise<unknown>;
  startDoubao(port?: number): Promise<unknown>;
  confirmRestart(port?: number): Promise<unknown>;
  applyTheme(id: string): Promise<unknown>;
  restoreOfficial(): Promise<void>;
  readLog(): Promise<string>;
  chooseDoubaoExecutable(): Promise<string | undefined>;
}

declare global {
  interface Window {
    doubaoSkin: DoubaoSkinApi;
  }
}
