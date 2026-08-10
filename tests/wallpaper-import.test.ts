import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeStore } from "../src/main/theme-store";
import { detectWallpaperFormat, normalizeWallpaperName } from "../src/shared/wallpaper-format";
import { DEFAULT_THEME } from "../src/shared/defaults";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.byteLength);
  chunk.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(chunk, 4);
  Buffer.from(data).copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 8 + data.byteLength);
  return chunk;
}

function pngImage(width: number, height: number): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1;
  const scanlines = Buffer.alloc((Math.ceil(width / 8) + 1) * height);
  return Uint8Array.from(Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0))
  ]));
}

const JPEG_BYTES = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7V+C37O3wp1v4OeBNR1H4ZeDr/ULzQbC4ubu60C0klnle3Rnd3aMlmYkkknJJJNFFFf0xln+40P8ABH8keXiP40/V/mf/2Q==",
  "base64"
);

const WEBP_BYTES = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
  "base64"
);

function webpChunk(type: string, data: Uint8Array): Buffer {
  const chunk = Buffer.alloc(8 + data.byteLength + (data.byteLength & 1));
  chunk.write(type, 0, "ascii");
  chunk.writeUInt32LE(data.byteLength, 4);
  Buffer.from(data).copy(chunk, 8);
  return chunk;
}

function webpWithCanvas(width: number, height: number, vp8Payload: Uint8Array): Uint8Array {
  const canvas = Buffer.alloc(10);
  canvas.writeUIntLE(width - 1, 4, 3);
  canvas.writeUIntLE(height - 1, 7, 3);
  const body = Buffer.concat([Buffer.from("WEBP"), webpChunk("VP8X", canvas), webpChunk("VP8 ", vp8Payload)]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.byteLength, 4);
  return Uint8Array.from(Buffer.concat([riff, body]));
}

function jpegWithFillBytes(): Uint8Array {
  const sof = JPEG_BYTES.findIndex((byte, index) => byte === 0xff && JPEG_SOF.has(JPEG_BYTES[index + 1]));
  return Uint8Array.from(Buffer.concat([JPEG_BYTES.subarray(0, sof + 1), Buffer.from([0xff]), JPEG_BYTES.subarray(sof + 1)]));
}

const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegWithFalseEndInAppSegment(): Uint8Array {
  return Uint8Array.of(
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x06, 0xff, 0xd9, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01, 0x01, 0x11, 0x00
  );
}

describe("wallpaper import", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("sniffs a PNG saved with a jpg filename and normalizes its name", () => {
    const format = detectWallpaperFormat(pngImage(4500, 3042));

    expect(format).toEqual({ kind: "png", extension: ".png", mime: "image/png" });
    expect(normalizeWallpaperName("002.jpg", format!)).toBe("002.png");
  });

  it("accepts a common 4500 by 3042 photo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doubao-large-wallpaper-"));
    roots.push(root);
    const userRoot = path.join(root, "user");
    const builtInRoot = path.join(root, "built-in");
    await mkdir(builtInRoot, { recursive: true });
    const store = new ThemeStore(userRoot, builtInRoot);
    const theme = {
      ...structuredClone(DEFAULT_THEME),
      id: "large-photo",
      wallpaper: { ...DEFAULT_THEME.wallpaper, file: "002.png" }
    };

    await expect(store.save(theme, { name: "002.png", bytes: pngImage(4500, 3042) })).resolves.toMatchObject({
      id: "large-photo",
      wallpaperFile: "002.png"
    });
  });

  it("accepts a 7000 by 5000 high-resolution photo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doubao-high-resolution-wallpaper-"));
    roots.push(root);
    const builtInRoot = path.join(root, "built-in");
    await mkdir(builtInRoot, { recursive: true });
    const store = new ThemeStore(path.join(root, "user"), builtInRoot);
    const theme = {
      ...structuredClone(DEFAULT_THEME),
      id: "high-resolution-photo",
      wallpaper: { ...DEFAULT_THEME.wallpaper, file: "photo.png" }
    };

    await expect(store.save(theme, { name: "photo.png", bytes: pngImage(7000, 5000) })).resolves.toMatchObject({
      id: "high-resolution-photo"
    });
  });

  it("still rejects an image whose decoded pixel buffer would be excessive", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doubao-huge-wallpaper-"));
    roots.push(root);
    const builtInRoot = path.join(root, "built-in");
    await mkdir(builtInRoot, { recursive: true });
    const store = new ThemeStore(path.join(root, "user"), builtInRoot);
    const theme = {
      ...structuredClone(DEFAULT_THEME),
      id: "huge-photo",
      wallpaper: { ...DEFAULT_THEME.wallpaper, file: "huge.png" }
    };

    await expect(store.save(theme, { name: "huge.png", bytes: pngImage(8192, 8192) })).rejects.toThrow(
      /dimensions/i
    );
  });

  it("rejects a truncated PNG even when its signature and dimensions are present", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doubao-truncated-wallpaper-"));
    roots.push(root);
    const builtInRoot = path.join(root, "built-in");
    await mkdir(builtInRoot, { recursive: true });
    const store = new ThemeStore(path.join(root, "user"), builtInRoot);
    const theme = {
      ...structuredClone(DEFAULT_THEME),
      id: "truncated-photo",
      wallpaper: { ...DEFAULT_THEME.wallpaper, file: "broken.png" }
    };

    await expect(store.save(theme, { name: "broken.png", bytes: pngImage(20, 10).slice(0, 24) })).rejects.toThrow(
      /image/i
    );
  });

  it("accepts a JPEG containing legal marker fill bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doubao-jpeg-wallpaper-"));
    roots.push(root);
    const builtInRoot = path.join(root, "built-in");
    await mkdir(builtInRoot, { recursive: true });
    const store = new ThemeStore(path.join(root, "user"), builtInRoot);
    const theme = {
      ...structuredClone(DEFAULT_THEME),
      id: "filled-jpeg",
      wallpaper: { ...DEFAULT_THEME.wallpaper, file: "photo.jpg" }
    };

    await expect(store.save(theme, { name: "photo.jpg", bytes: jpegWithFillBytes() })).resolves.toMatchObject({
      id: "filled-jpeg"
    });
  });

  it("does not accept an EOI byte pattern hidden inside a JPEG APP segment", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doubao-false-jpeg-"));
    roots.push(root);
    const builtInRoot = path.join(root, "built-in");
    await mkdir(builtInRoot, { recursive: true });
    const store = new ThemeStore(path.join(root, "user"), builtInRoot);
    const theme = {
      ...structuredClone(DEFAULT_THEME),
      id: "false-jpeg",
      wallpaper: { ...DEFAULT_THEME.wallpaper, file: "false.jpg" }
    };

    await expect(store.save(theme, { name: "false.jpg", bytes: jpegWithFalseEndInAppSegment() })).rejects.toThrow(/image/i);
  });

  it("accepts a complete WebP image and rejects a VP8X canvas without image data", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doubao-webp-"));
    roots.push(root);
    const builtInRoot = path.join(root, "built-in");
    await mkdir(builtInRoot, { recursive: true });
    const store = new ThemeStore(path.join(root, "user"), builtInRoot);
    const theme = {
      ...structuredClone(DEFAULT_THEME),
      id: "webp-photo",
      wallpaper: { ...DEFAULT_THEME.wallpaper, file: "photo.webp" }
    };
    const headerOnly = Uint8Array.of(
      82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80,
      86, 80, 56, 88, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    );
    const wrongRiffSize = Uint8Array.from(WEBP_BYTES);
    wrongRiffSize[4] = 0;
    const oversizedPayload = Buffer.from(WEBP_BYTES.subarray(20));
    oversizedPayload.writeUInt16LE(8192, 6);
    oversizedPayload.writeUInt16LE(8192, 8);
    const mismatchedCanvas = webpWithCanvas(1, 1, oversizedPayload);

    await expect(store.save(theme, { name: "photo.webp", bytes: WEBP_BYTES })).resolves.toMatchObject({ id: "webp-photo" });
    await expect(store.save(theme, { name: "photo.webp", bytes: headerOnly })).rejects.toThrow(/image/i);
    await expect(store.save(theme, { name: "photo.webp", bytes: wrongRiffSize })).rejects.toThrow(/image/i);
    await expect(store.save(theme, { name: "photo.webp", bytes: mismatchedCanvas })).rejects.toThrow(/image|dimensions/i);
  });
});
