import {
  MAX_WALLPAPER_BYTES,
  MAX_WALLPAPER_EDGE,
  MAX_WALLPAPER_PIXELS
} from "../shared/contracts";
import {
  detectWallpaperFormat,
  wallpaperExtensionMatches,
  type WallpaperFormat
} from "../shared/wallpaper-format";

export interface WallpaperInspection {
  format: WallpaperFormat;
  width: number;
  height: number;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] * 0x1000000
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]) >>> 0;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 33) return undefined;
  let offset = 8;
  let dimensions: { width: number; height: number } | undefined;
  let sawImageData = false;

  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const dataOffset = offset + 8;
    const next = dataOffset + length + 4;
    if (next > bytes.length) return undefined;

    if (offset === 8) {
      if (type !== "IHDR" || length !== 13) return undefined;
      dimensions = { width: u32be(bytes, dataOffset), height: u32be(bytes, dataOffset + 4) };
      const bitDepth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      const validDepth = colorType === 0 ? [1, 2, 4, 8, 16].includes(bitDepth)
        : colorType === 2 ? bitDepth === 8 || bitDepth === 16
          : colorType === 3 ? [1, 2, 4, 8].includes(bitDepth)
            : colorType === 4 || colorType === 6 ? bitDepth === 8 || bitDepth === 16
              : false;
      if (!validDepth
        || bytes[dataOffset + 10] !== 0
        || bytes[dataOffset + 11] !== 0
        || (bytes[dataOffset + 12] !== 0 && bytes[dataOffset + 12] !== 1)) return undefined;
    } else if (type === "IHDR") {
      return undefined;
    }

    if (type === "IDAT" && length > 0) sawImageData = true;
    if (type === "IEND") return length === 0 && sawImageData ? dimensions : undefined;
    offset = next;
  }
  return undefined;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function jpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 12) return undefined;
  let offset = 2;
  let dimensions: { width: number; height: number } | undefined;
  let inScan = false;
  let entropyBytes = 0;
  while (offset < bytes.length) {
    if (inScan && bytes[offset] !== 0xff) {
      entropyBytes += 1;
      offset += 1;
      continue;
    }
    if (bytes[offset] !== 0xff) return undefined;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return undefined;
    const marker = bytes[offset];
    offset += 1;
    if (inScan && marker === 0x00) {
      entropyBytes += 1;
      continue;
    }
    if (marker === 0x00) return undefined;
    if (marker === 0xd9) return inScan && entropyBytes > 0 ? dimensions : undefined;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return undefined;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return undefined;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (length < 8) return undefined;
      dimensions = {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6]
      };
    }
    if (marker === 0xda) {
      if (!dimensions) return undefined;
      inScan = true;
      offset += length;
      continue;
    }
    if (inScan) inScan = false;
    offset += length;
  }
  return undefined;
}

function webpSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 30) return undefined;
  const declaredEnd = u32le(bytes, 4) + 8;
  if (declaredEnd !== bytes.length) return undefined;
  let offset = 12;
  let canvasDimensions: { width: number; height: number } | undefined;
  let payloadDimensions: { width: number; height: number } | undefined;
  while (offset + 8 <= declaredEnd) {
    const kind = ascii(bytes, offset, 4);
    const chunkLength = u32le(bytes, offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + chunkLength;
    const next = dataEnd + (chunkLength & 1);
    if (dataEnd > declaredEnd || next > declaredEnd) return undefined;

    if (kind === "VP8X" && chunkLength >= 10) {
      if ((bytes[dataOffset] & 0x02) !== 0) return undefined;
      canvasDimensions = { width: u24le(bytes, dataOffset + 4) + 1, height: u24le(bytes, dataOffset + 7) + 1 };
    } else if (kind === "VP8L" && chunkLength >= 5 && bytes[dataOffset] === 0x2f) {
      if (payloadDimensions) return undefined;
      payloadDimensions = {
        width: 1 + bytes[dataOffset + 1] + ((bytes[dataOffset + 2] & 0x3f) << 8),
        height: 1 + (bytes[dataOffset + 2] >> 6) + (bytes[dataOffset + 3] << 2) + ((bytes[dataOffset + 4] & 0x0f) << 10)
      };
    } else if (kind === "VP8 " && chunkLength >= 10
      && bytes[dataOffset + 3] === 0x9d && bytes[dataOffset + 4] === 0x01 && bytes[dataOffset + 5] === 0x2a) {
      if (payloadDimensions) return undefined;
      payloadDimensions = {
        width: u16le(bytes, dataOffset + 6) & 0x3fff,
        height: u16le(bytes, dataOffset + 8) & 0x3fff
      };
    } else if (kind === "ANIM" || kind === "ANMF") {
      return undefined;
    }
    offset = next;
  }
  if (offset !== declaredEnd || !payloadDimensions) return undefined;
  if (canvasDimensions
    && (payloadDimensions.width > canvasDimensions.width || payloadDimensions.height > canvasDimensions.height)) {
    return undefined;
  }
  return canvasDimensions ?? payloadDimensions;
}

export function validateWallpaperByteLength(length: number): void {
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_WALLPAPER_BYTES) {
    throw new Error("Wallpaper image exceeds the size limit");
  }
}

export function inspectWallpaper(name: string, bytes: Uint8Array): WallpaperInspection {
  validateWallpaperByteLength(bytes.byteLength);
  const format = detectWallpaperFormat(bytes);
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!format || !wallpaperExtensionMatches(extension, format)) {
    throw new Error("Wallpaper image header is invalid");
  }
  const dimensions = format.kind === "png" ? pngSize(bytes)
    : format.kind === "jpeg" ? jpegSize(bytes)
      : webpSize(bytes);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    throw new Error("Wallpaper image header is invalid");
  }
  if (dimensions.width > MAX_WALLPAPER_EDGE
    || dimensions.height > MAX_WALLPAPER_EDGE
    || dimensions.width * dimensions.height > MAX_WALLPAPER_PIXELS) {
    throw new Error("Wallpaper image dimensions exceed the limit");
  }
  return { format, ...dimensions };
}
