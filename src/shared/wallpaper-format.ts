export interface WallpaperFormat {
  kind: "png" | "jpeg" | "webp";
  extension: ".png" | ".jpg" | ".webp";
  mime: "image/png" | "image/jpeg" | "image/webp";
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export function detectWallpaperFormat(bytes: Uint8Array): WallpaperFormat | undefined {
  if (bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return { kind: "png", extension: ".png", mime: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: "jpeg", extension: ".jpg", mime: "image/jpeg" };
  }
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return { kind: "webp", extension: ".webp", mime: "image/webp" };
  }
  return undefined;
}

export function wallpaperExtensionMatches(extension: string, format: WallpaperFormat): boolean {
  return format.kind === "jpeg"
    ? extension === ".jpg" || extension === ".jpeg"
    : extension === format.extension;
}

export function normalizeWallpaperName(name: string, format: WallpaperFormat): string {
  const safeName = name.replace(/[\\/]/g, "_");
  const dot = safeName.lastIndexOf(".");
  const stem = (dot > 0 ? safeName.slice(0, dot) : safeName) || "wallpaper";
  return `${stem}${format.extension}`;
}
