import { strToU8, unzipSync, zipSync } from "fflate";
import { MAX_WALLPAPER_BYTES, validateTheme, type Theme } from "../shared/contracts";
import { validateExtraCss } from "./css-validator";
import { ThemeStore } from "./theme-store";

const MAX_THEME_JSON_BYTES = 128 * 1024;
const MAX_EXTRA_CSS_BYTES = 100 * 1024;
const MAX_ARCHIVE_BYTES = 30 * 1024 * 1024;
const IMAGE_NAME = /^[^/\\]+\.(?:png|jpe?g|webp)$/i;

function assertCentralDirectoryIsSafe(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error("ZIP end record is missing");
  const count = view.getUint16(end + 10, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || centralOffset === 0xffffffff) throw new Error("ZIP64 archives are not supported");
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("ZIP central directory is invalid");
    }
    const flags = view.getUint16(offset + 8, true);
    if ((flags & 1) !== 0) throw new Error("Encrypted ZIP entries are not supported");
    const sourceSystem = bytes[offset + 5];
    const unixMode = view.getUint32(offset + 38, true) >>> 16;
    if (sourceSystem === 3 && (unixMode & 0o170000) === 0o120000) {
      throw new Error("Symbolic links are not allowed");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

function allowedEntryName(name: string): boolean {
  const normalized = name.replace(/\\/g, "/");
  if (normalized !== name || normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) return false;
  if (normalized.split("/").some((part) => part === ".." || part === "")) return false;
  return normalized === "theme.json" || normalized === "extra.css" || IMAGE_NAME.test(normalized);
}

function rewriteThemeScope(css: string, previousId: string, nextId: string): string {
  return previousId === nextId ? css : css.split(`.theme-${previousId}`).join(`.theme-${nextId}`);
}

export class ThemeArchive {
  constructor(private readonly store: ThemeStore) {}

  async exportThemeZip(id: string): Promise<Uint8Array> {
    const bundle = await this.store.readBundle(id);
    return zipSync({
      "theme.json": strToU8(`${JSON.stringify(bundle.theme, null, 2)}\n`),
      [bundle.asset.name]: bundle.asset.bytes,
      ...(bundle.extraCss === undefined ? {} : { "extra.css": strToU8(bundle.extraCss) })
    }, { level: 6 });
  }

  async importThemeZip(bytes: Uint8Array): Promise<Awaited<ReturnType<ThemeStore["save"]>>> {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_ARCHIVE_BYTES) {
      throw new Error("ZIP archive exceeds the size limit");
    }
    assertCentralDirectoryIsSafe(bytes);
    const names = new Set<string>();
    let expandedSize = 0;
    const files = unzipSync(bytes, {
      filter: (entry) => {
        if (!allowedEntryName(entry.name)) throw new Error(`ZIP entry is not allowed: ${entry.name}`);
        if (names.has(entry.name)) throw new Error(`Duplicate ZIP entry: ${entry.name}`);
        names.add(entry.name);
        const limit = entry.name === "theme.json" ? MAX_THEME_JSON_BYTES
          : entry.name === "extra.css" ? MAX_EXTRA_CSS_BYTES
            : MAX_WALLPAPER_BYTES;
        if (entry.originalSize > limit) throw new Error(`ZIP entry is too large: ${entry.name}`);
        expandedSize += entry.originalSize;
        if (expandedSize > MAX_WALLPAPER_BYTES + MAX_THEME_JSON_BYTES + MAX_EXTRA_CSS_BYTES) {
          throw new Error("ZIP expanded size exceeds the limit");
        }
        return true;
      }
    });
    const entryNames = Object.keys(files);
    if (entryNames.length < 2 || entryNames.length > 3 || !files["theme.json"]) {
      throw new Error("ZIP must contain theme.json, one wallpaper, and optional extra.css");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(files["theme.json"]));
    } catch {
      throw new Error("theme.json is not valid UTF-8 JSON");
    }
    const result = validateTheme(parsed);
    if (!result.ok) throw new Error(`Invalid theme: ${result.errors.join("; ")}`);
    const wallpaperNames = entryNames.filter((name) => IMAGE_NAME.test(name));
    if (wallpaperNames.length !== 1 || wallpaperNames[0] !== result.theme.wallpaper.file) {
      throw new Error("ZIP wallpaper does not match theme.json");
    }

    const id = await this.store.nextAvailableId(result.theme.id);
    const theme: Theme = id === result.theme.id ? result.theme : { ...result.theme, id };
    let extraCss: string | undefined;
    if (files["extra.css"]) {
      try {
        const candidate = new TextDecoder("utf-8", { fatal: true }).decode(files["extra.css"]);
        if (validateExtraCss(candidate, result.theme.id).ok) {
          extraCss = rewriteThemeScope(candidate, result.theme.id, theme.id);
        }
      } catch { /* Invalid optional CSS is discarded. */ }
    }
    return this.store.save(theme, { name: theme.wallpaper.file, bytes: files[wallpaperNames[0]] }, extraCss);
  }
}
