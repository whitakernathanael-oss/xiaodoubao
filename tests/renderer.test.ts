// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/renderer/palette", () => ({ extractPalette: vi.fn() }));

import { mountApp } from "../src/renderer/app";
import { extractPalette } from "../src/renderer/palette";
import type { DoubaoSkinApi } from "../src/shared/ipc";
import { DEFAULT_THEME } from "../src/shared/defaults";

function api(): DoubaoSkinApi {
  return {
    listThemes: vi.fn(async () => [{
      id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, author: DEFAULT_THEME.author,
      wallpaperFile: DEFAULT_THEME.wallpaper.file, readOnly: false,
      surfaceColor: "#f1e2d3", accentColor: "#456789"
    }]),
    loadTheme: vi.fn(async () => structuredClone(DEFAULT_THEME)),
    saveTheme: vi.fn(async (input) => ({
      id: input.theme.id, name: input.theme.name, author: input.theme.author,
      wallpaperFile: input.theme.wallpaper.file, readOnly: false,
      surfaceColor: input.theme.palette.surface, accentColor: input.theme.palette.accent
    })),
    deleteTheme: vi.fn(async () => undefined), duplicateTheme: vi.fn(),
    importTheme: vi.fn(), exportTheme: vi.fn(async () => true), chooseWallpaper: vi.fn(),
    getStatus: vi.fn(async () => ({ kind: "not-running" })), startDoubao: vi.fn(),
    confirmRestart: vi.fn(), applyTheme: vi.fn(async () => ({ kind: "applied" })),
    restoreOfficial: vi.fn(async () => undefined), readLog: vi.fn(async () => ""),
    chooseDoubaoExecutable: vi.fn()
  };
}

describe("single-window editor", () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    vi.mocked(extractPalette).mockResolvedValue({
      ink: "#101820",
      mutedInk: "#53606a",
      accent: "#2c8cff",
      surface: "#e8f2ff",
      route: "light",
      textContrast: 12.4
    });
    URL.createObjectURL = vi.fn(() => "blob:wallpaper");
    URL.revokeObjectURL = vi.fn();
  });

  it("mounts the status, themes, preview tabs, controls, and actions", async () => {
    const fake = api();
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    expect(root.querySelector("[data-role='status']")).not.toBeNull();
    expect(root.querySelector("[data-role='themes']")).not.toBeNull();
    expect(root.querySelector("[data-preview-page='chat']")).not.toBeNull();
    expect(root.querySelector("[data-preview-page='settings']")).not.toBeNull();
    expect(root.querySelector("[data-role='region-controls']")).not.toBeNull();
    expect(root.querySelector("[data-action='restore']")).not.toBeNull();

    root.querySelector<HTMLButtonElement>("[data-action='apply']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.applyTheme).toHaveBeenCalledOnce();
    expect(fake.applyTheme).toHaveBeenCalledWith(DEFAULT_THEME.id);
  });

  it("asks the main process for confirmed restart when Doubao requires it", async () => {
    const fake = api();
    vi.mocked(fake.startDoubao).mockResolvedValue({ kind: "restart-required" });
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    root.querySelector<HTMLButtonElement>("[data-action='start']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.confirmRestart).toHaveBeenCalledOnce();
  });

  it("does not offer font-colour controls that real Doubao cannot apply", async () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, api());
    expect(root.textContent).not.toContain("文字色");
  });

  it("uses each theme's own palette for its card swatch", async () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, api());

    const swatch = root.querySelector<HTMLElement>(".theme-card__swatch")!;

    expect(swatch.style.getPropertyValue("--theme-surface")).toBe("#f1e2d3");
    expect(swatch.style.getPropertyValue("--theme-accent")).toBe("#456789");
  });

  it("keeps only wallpaper controls for ordinary users", async () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, api());

    expect(root.querySelector(".region-tabs")).toBeNull();
    expect(root.querySelector("input[type='color']")).toBeNull();
    expect(root.querySelector("[data-action='undo']")).toBeNull();
    expect(root.querySelector("[data-action='reset']")).toBeNull();
    expect(root.querySelector("[data-role='region-controls']")!.textContent).toContain("选择静态壁纸");
  });

  it("saves image-derived accents without changing Doubao text colours", async () => {
    const fake = api();
    vi.mocked(fake.chooseWallpaper).mockResolvedValue({
      name: "photo.png",
      mime: "image/png",
      bytes: Uint8Array.of(137, 80, 78, 71)
    });
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    root.querySelector<HTMLButtonElement>(".wallpaper-picker")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.querySelector<HTMLButtonElement>("[data-action='save']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const saved = vi.mocked(fake.saveTheme).mock.calls.at(-1)?.[0].theme;
    expect(saved?.palette.accent).toBe("#2c8cff");
    expect(saved?.regions.sidebar.selectedColor).toBe("#2c8cff");
    expect(saved?.regions.buttons.primaryColor).toBe("#2c8cff");
    expect(saved?.regions.chat.backgroundColor).toBe("#e8f2ff");
    expect(saved?.regions.sidebar.textColor).toBe(DEFAULT_THEME.regions.sidebar.textColor);
    expect(saved?.regions.chat.textColor).toBe(DEFAULT_THEME.regions.chat.textColor);
  });
});
