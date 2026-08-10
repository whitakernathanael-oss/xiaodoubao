import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "../src/shared/defaults";
import { validateTheme, type Theme } from "../src/shared/contracts";
import { ThemeStore } from "../src/main/theme-store";

const PNG_BYTES = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
));

function userTheme(id = "my-theme"): Theme {
  return {
    ...structuredClone(DEFAULT_THEME),
    id,
    name: "My Theme",
    wallpaper: { ...DEFAULT_THEME.wallpaper, file: "wallpaper.png" }
  };
}

describe("theme validation and storage", () => {
  let root: string;
  let userRoot: string;
  let builtInRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "doubao-skin-"));
    userRoot = path.join(root, "user");
    builtInRoot = path.join(root, "built-in");
    await mkdir(path.join(builtInRoot, "clean-light"), { recursive: true });
    await writeFile(
      path.join(builtInRoot, "clean-light", "theme.json"),
      JSON.stringify(DEFAULT_THEME)
    );
    await writeFile(path.join(builtInRoot, "clean-light", "wallpaper.png"), PNG_BYTES);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("rejects a theme that references a parent path", () => {
    const theme = userTheme();
    const result = validateTheme({
      ...theme,
      wallpaper: { ...theme.wallpaper, file: "../x.png" }
    });
    expect(result.ok).toBe(false);
  });

  it("materializes missing optional region values", () => {
    const theme = userTheme();
    const result = validateTheme({ ...theme, regions: { sidebar: {} } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.regions.sidebar.borderRadius).toBe(
        DEFAULT_THEME.regions.sidebar.borderRadius
      );
      expect(result.theme.regions.chat).toEqual(DEFAULT_THEME.regions.chat);
    }
  });

  it("accepts an rgba color within channel ranges", () => {
    const theme = userTheme();
    const result = validateTheme({
      ...theme,
      regions: {
        ...theme.regions,
        sidebar: { ...theme.regions.sidebar, backgroundColor: "rgba(20, 30, 40, 0.8)" }
      }
    });
    expect(result.ok).toBe(true);
  });

  it("round-trips a user theme atomically", async () => {
    const store = new ThemeStore(userRoot, builtInRoot);
    const theme = userTheme();
    await store.save(theme, { name: "wallpaper.png", bytes: PNG_BYTES });

    expect(await store.load(theme.id)).toEqual(theme);
    expect(JSON.parse(await readFile(path.join(userRoot, theme.id, "theme.json"), "utf8"))).toEqual(theme);
    expect((await store.list()).find((item) => item.id === theme.id)?.readOnly).toBe(false);
  });

  it("lists the actual palette colours used by a theme card", async () => {
    const store = new ThemeStore(userRoot, builtInRoot);
    const theme = userTheme();
    theme.palette = { ...theme.palette, surface: "#f1e2d3", accent: "#456789" };
    await store.save(theme, { name: "wallpaper.png", bytes: PNG_BYTES });

    const summary = (await store.list()).find((item) => item.id === theme.id)!;

    expect(summary.surfaceColor).toBe("#f1e2d3");
    expect(summary.accentColor).toBe("#456789");
  });

  it("keeps built-in themes read-only and duplicates them as user themes", async () => {
    const store = new ThemeStore(userRoot, builtInRoot);

    await expect(store.save(DEFAULT_THEME, { name: "wallpaper.png", bytes: PNG_BYTES })).rejects.toThrow(
      /read-only/i
    );
    await expect(store.remove(DEFAULT_THEME.id)).rejects.toThrow(/read-only/i);

    const copy = await store.duplicate(DEFAULT_THEME.id);
    expect(copy.id).toBe("clean-light-2");
    expect(copy.readOnly).toBe(false);
    expect((await store.load(copy.id)).name).toBe("Clean Light Copy");
  });

  it("rejects an asset whose bytes do not match its extension", async () => {
    const store = new ThemeStore(userRoot, builtInRoot);
    await expect(
      store.save(userTheme(), { name: "wallpaper.png", bytes: Uint8Array.of(1, 2, 3) })
    ).rejects.toThrow(/image/i);
  });
});
