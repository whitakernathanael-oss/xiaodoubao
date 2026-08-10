import { DEFAULT_THEME } from "./defaults";

export const THEME_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const MAX_WALLPAPER_BYTES = 50 * 1024 * 1024;
export const MAX_WALLPAPER_EDGE = 8192;
export const MAX_WALLPAPER_PIXELS = 36 * 1024 * 1024;
export const WALLPAPER_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export type WallpaperFit = "cover" | "contain";

export interface WallpaperSettings {
  file: string;
  fit: WallpaperFit;
  positionX: number;
  positionY: number;
  scale: number;
  blur: number;
  brightness: number;
  overlayColor: string;
  overlayOpacity: number;
}

export interface ThemePalette {
  ink: string;
  mutedInk: string;
  accent: string;
  surface: string;
}

export interface SidebarRegion {
  backgroundColor: string;
  opacity: number;
  textColor: string;
  selectedColor: string;
  borderColor: string;
  borderRadius: number;
}

export interface ChatRegion {
  backgroundColor: string;
  opacity: number;
  userBubbleColor: string;
  assistantBubbleColor: string;
  textColor: string;
  borderColor: string;
  borderRadius: number;
  shadowStrength: number;
}

export interface ComposerRegion {
  backgroundColor: string;
  opacity: number;
  textColor: string;
  borderColor: string;
  borderRadius: number;
  focusColor: string;
}

export interface ButtonsRegion {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderRadius: number;
  shadowStrength: number;
}

export interface SettingsRegion {
  panelColor: string;
  opacity: number;
}

export interface ThemeRegions {
  sidebar: SidebarRegion;
  chat: ChatRegion;
  composer: ComposerRegion;
  buttons: ButtonsRegion;
  settings: SettingsRegion;
}

export interface Theme {
  formatVersion: 1;
  id: string;
  name: string;
  author: string;
  wallpaper: WallpaperSettings;
  palette: ThemePalette;
  regions: ThemeRegions;
}

export interface ThemeSummary {
  id: string;
  name: string;
  author: string;
  wallpaperFile: string;
  surfaceColor: string;
  accentColor: string;
  readOnly: boolean;
}

export type ThemeValidationResult =
  | { ok: true; theme: Theme }
  | { ok: false; errors: string[] };

export const ADAPTER_REGION_KEYS = [
  "appRoot",
  "sidebar",
  "chatArea",
  "messageUser",
  "messageAssistant",
  "composer",
  "buttons",
  "settingsPanel"
] as const;

export type AdapterRegion = typeof ADAPTER_REGION_KEYS[number];
export type AdapterPageState = "chat" | "settings";

export interface DoubaoAdapter {
  adapterVersion: 1;
  targets: Array<{ kind: "main" | "settings"; urlPrefix: string }>;
  regions: Record<AdapterRegion, string[]>;
  pageStates: Record<AdapterPageState, { requiredRegions: AdapterRegion[] }>;
}

export interface AdapterProbe {
  status: "compatible" | "partial" | "incompatible";
  matches: Partial<Record<AdapterRegion, { selector: string; count: number }>>;
  missingRequired: AdapterRegion[];
  missingOptional: AdapterRegion[];
}

export function isThemeId(value: string): boolean {
  return THEME_ID_PATTERN.test(value);
}

const COLOR_PATTERN = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const RGB_PATTERN = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;

function isColor(value: string): boolean {
  if (COLOR_PATTERN.test(value)) return true;
  const match = RGB_PATTERN.exec(value);
  if (!match || /^rgba/i.test(value) !== (match[4] !== undefined)) return false;
  return match.slice(1, 4).every((channel) => Number(channel) <= 255)
    && (match[4] === undefined || Number(match[4]) <= 1);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(
  value: unknown,
  fallback: string,
  field: string,
  errors: string[],
  maxLength = 80
): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    errors.push(`${field} must be a non-empty string of at most ${maxLength} characters`);
    return fallback;
  }
  return value;
}

function numberInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
  errors: string[]
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    errors.push(`${field} must be between ${min} and ${max}`);
    return fallback;
  }
  return value;
}

function color(
  value: unknown,
  fallback: string,
  field: string,
  errors: string[]
): string {
  if (typeof value !== "string" || !isColor(value)) {
    errors.push(`${field} must be a hex, rgb, or rgba color`);
    return fallback;
  }
  return COLOR_PATTERN.test(value) ? value.toLowerCase() : value;
}

function region<T extends object>(
  input: unknown,
  defaults: T,
  prefix: string,
  colorFields: readonly (keyof T)[],
  numericFields: ReadonlyArray<readonly [keyof T, number, number]>,
  errors: string[]
): T {
  const source = record(input);
  const output = { ...defaults } as T;
  for (const field of colorFields) {
    if (source[field as string] !== undefined) {
      output[field] = color(source[field as string], defaults[field] as string, `${prefix}.${String(field)}`, errors) as T[keyof T];
    }
  }
  for (const [field, min, max] of numericFields) {
    if (source[field as string] !== undefined) {
      output[field] = numberInRange(source[field as string], defaults[field] as number, min, max, `${prefix}.${String(field)}`, errors) as T[keyof T];
    }
  }
  return output;
}

export function validateTheme(input: unknown): ThemeValidationResult {
  const defaults = DEFAULT_THEME;
  const source = record(input);
  const errors: string[] = [];
  if (source.formatVersion !== 1) errors.push("formatVersion must be 1");

  const id = text(source.id, defaults.id, "id", errors, 64);
  if (!isThemeId(id)) errors.push("id must be lowercase kebab-case");
  const wallpaperInput = record(source.wallpaper);
  const file = text(wallpaperInput.file, defaults.wallpaper.file, "wallpaper.file", errors, 128);
  const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
  if (file.includes("/") || file.includes("\\") || file === "." || file === "..") {
    errors.push("wallpaper.file must be one root filename");
  }
  if (!WALLPAPER_EXTENSIONS.has(extension)) errors.push("wallpaper.file has an unsupported extension");
  const fit = wallpaperInput.fit === "cover" || wallpaperInput.fit === "contain"
    ? wallpaperInput.fit
    : (errors.push("wallpaper.fit must be cover or contain"), defaults.wallpaper.fit);

  const paletteInput = record(source.palette);
  const regionsInput = record(source.regions);
  const theme: Theme = {
    formatVersion: 1,
    id,
    name: text(source.name, defaults.name, "name", errors),
    author: text(source.author, defaults.author, "author", errors),
    wallpaper: {
      file,
      fit,
      positionX: numberInRange(wallpaperInput.positionX, defaults.wallpaper.positionX, 0, 100, "wallpaper.positionX", errors),
      positionY: numberInRange(wallpaperInput.positionY, defaults.wallpaper.positionY, 0, 100, "wallpaper.positionY", errors),
      scale: numberInRange(wallpaperInput.scale, defaults.wallpaper.scale, 25, 300, "wallpaper.scale", errors),
      blur: numberInRange(wallpaperInput.blur, defaults.wallpaper.blur, 0, 40, "wallpaper.blur", errors),
      brightness: numberInRange(wallpaperInput.brightness, defaults.wallpaper.brightness, 0, 200, "wallpaper.brightness", errors),
      overlayColor: color(wallpaperInput.overlayColor, defaults.wallpaper.overlayColor, "wallpaper.overlayColor", errors),
      overlayOpacity: numberInRange(wallpaperInput.overlayOpacity, defaults.wallpaper.overlayOpacity, 0, 1, "wallpaper.overlayOpacity", errors)
    },
    palette: {
      ink: color(paletteInput.ink, defaults.palette.ink, "palette.ink", errors),
      mutedInk: color(paletteInput.mutedInk, defaults.palette.mutedInk, "palette.mutedInk", errors),
      accent: color(paletteInput.accent, defaults.palette.accent, "palette.accent", errors),
      surface: color(paletteInput.surface, defaults.palette.surface, "palette.surface", errors)
    },
    regions: {
      sidebar: region(regionsInput.sidebar, defaults.regions.sidebar, "regions.sidebar", ["backgroundColor", "textColor", "selectedColor", "borderColor"], [["opacity", 0, 1], ["borderRadius", 0, 64]], errors),
      chat: region(regionsInput.chat, defaults.regions.chat, "regions.chat", ["backgroundColor", "userBubbleColor", "assistantBubbleColor", "textColor", "borderColor"], [["opacity", 0, 1], ["borderRadius", 0, 64], ["shadowStrength", 0, 1]], errors),
      composer: region(regionsInput.composer, defaults.regions.composer, "regions.composer", ["backgroundColor", "textColor", "borderColor", "focusColor"], [["opacity", 0, 1], ["borderRadius", 0, 64]], errors),
      buttons: region(regionsInput.buttons, defaults.regions.buttons, "regions.buttons", ["primaryColor", "backgroundColor", "textColor", "borderColor"], [["borderRadius", 0, 64], ["shadowStrength", 0, 1]], errors),
      settings: region(regionsInput.settings, defaults.regions.settings, "regions.settings", ["panelColor"], [["opacity", 0, 1]], errors)
    }
  };
  return errors.length === 0 ? { ok: true, theme } : { ok: false, errors };
}
