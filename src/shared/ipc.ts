import type { Theme, ThemeSummary } from "./contracts";

export const IPC_CHANNELS = {
  themeList: "theme:list",
  themeLoad: "theme:load",
  wallpaperLoad: "wallpaper:load",
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
  skinPersistenceGet: "skin:persistence:get",
  skinPersistenceSet: "skin:persistence:set",
  skinAutomationGet: "skin:automation:get",
  skinAutomationSet: "skin:automation:set"
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
  loadWallpaper(id: string): Promise<WallpaperSelection>;
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
  getSkinPersistence(): Promise<{ enabled: boolean }>;
  setSkinPersistence(enabled: boolean): Promise<{ enabled: boolean }>;
  getSkinAutomation(): Promise<{ confirmBeforeRestart: boolean; temporarilyDisabled: boolean }>;
  setSkinAutomation(settings: { confirmBeforeRestart?: boolean; temporarilyDisabled?: boolean }): Promise<{ confirmBeforeRestart: boolean; temporarilyDisabled: boolean }>;
  chooseDoubaoExecutable(): Promise<string | undefined>;
}

declare global {
  interface Window {
    doubaoSkin: DoubaoSkinApi;
  }
}
