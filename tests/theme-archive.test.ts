import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeArchive } from "../src/main/theme-archive";
import { ThemeStore } from "../src/main/theme-store";
import { DEFAULT_THEME } from "../src/shared/defaults";
import { MAX_WALLPAPER_BYTES, type Theme } from "../src/shared/contracts";

const PNG_BYTES = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
));

function theme(id = "clean-light-2"): Theme {
  return {
    ...structuredClone(DEFAULT_THEME),
    id,
    name: "Archive Theme",
    wallpaper: { ...DEFAULT_THEME.wallpaper, file: "wallpaper.png" }
  };
}

function archiveFiles(input: Theme, extraCss?: string): Record<string, Uint8Array> {
  return {
    "theme.json": strToU8(JSON.stringify(input)),
    [input.wallpaper.file]: PNG_BYTES,
    ...(extraCss === undefined ? {} : { "extra.css": strToU8(extraCss) })
  };
}

describe("theme ZIP archives", () => {
  let root: string;
  let userRoot: string;
  let store: ThemeStore;
  let archive: ThemeArchive;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "doubao-archive-"));
    userRoot = path.join(root, "user");
    const builtInRoot = path.join(root, "built-in");
    await mkdir(builtInRoot, { recursive: true });
    store = new ThemeStore(userRoot, builtInRoot);
    archive = new ThemeArchive(store);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("exports, removes, and imports an equivalent theme", async () => {
    const input = theme();
    const css = `html.doubao-skin.theme-${input.id} .dbs-sidebar { opacity: .8 }`;
    await store.save(input, { name: "wallpaper.png", bytes: PNG_BYTES }, css);

    const zip = await archive.exportThemeZip(input.id);
    await store.remove(input.id);
    const imported = await archive.importThemeZip(zip);

    expect((await store.load(imported.id)).palette).toEqual(input.palette);
    expect((await store.readBundle(imported.id)).extraCss).toBe(css);
  });

  it("adds a numeric suffix when an imported id already exists", async () => {
    const input = theme("summer");
    await store.save(input, { name: "wallpaper.png", bytes: PNG_BYTES });

    const imported = await archive.importThemeZip(zipSync(archiveFiles(input)));

    expect(imported.id).toBe("summer-2");
    expect((await store.load("summer-2")).id).toBe("summer-2");
  });

  it("drops unsafe optional CSS but imports the standard theme", async () => {
    const input = theme("safe-standard");
    const imported = await archive.importThemeZip(zipSync(archiveFiles(
      input,
      "body { background: url(https://example.com/x) }"
    )));

    expect(imported.id).toBe(input.id);
    expect((await store.readBundle(input.id)).extraCss).toBeUndefined();
  });

  it("rejects a symbolic-link entry", async () => {
    const input = theme("linked-wallpaper");
    const zip = zipSync({
      "theme.json": strToU8(JSON.stringify(input)),
      "wallpaper.png": [PNG_BYTES, { os: 3, attrs: (0o120777 << 16) >>> 0 }]
    });

    await expect(archive.importThemeZip(zip)).rejects.toThrow(/symbolic link/i);
    expect(await store.list()).toEqual([]);
  });

  it.each([
    ["parent traversal", "../escape.json", strToU8("{}")],
    ["absolute path", "/absolute.json", strToU8("{}")],
    ["nested archive", "nested.zip", zipSync({ "x.txt": strToU8("x") })],
    ["JavaScript", "theme.js", strToU8("alert(1)")],
    ["oversized expansion", "wallpaper.png", new Uint8Array(MAX_WALLPAPER_BYTES + 1)]
  ])("rejects %s without changing the theme store", async (_label, name, bytes) => {
    const before = await store.list();
    const malicious = zipSync({ [name as string]: bytes as Uint8Array }, { level: 1 });

    await expect(archive.importThemeZip(malicious)).rejects.toThrow();
    expect(await store.list()).toEqual(before);
  });
});
