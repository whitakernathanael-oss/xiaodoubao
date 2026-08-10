// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/renderer/palette", () => ({ extractPalette: vi.fn() }));

import { mountApp } from "../src/renderer/app";
import { extractPalette } from "../src/renderer/palette";
import type { ThemeSummary } from "../src/shared/contracts";
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
    loadWallpaper: vi.fn(async () => ({ name: "wallpaper.png", mime: "image/png" as const, bytes: Uint8Array.of(137, 80, 78, 71) })),
    deleteTheme: vi.fn(async () => undefined), duplicateTheme: vi.fn(),
    importTheme: vi.fn(), exportTheme: vi.fn(async () => true), chooseWallpaper: vi.fn(),
    getStatus: vi.fn(async () => ({ kind: "not-running" })), startDoubao: vi.fn(),
    confirmRestart: vi.fn(), applyTheme: vi.fn(async () => ({ kind: "applied" })),
    restoreOfficial: vi.fn(async () => undefined),
    chooseDoubaoExecutable: vi.fn()
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve };
}

describe("single-window editor", () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    vi.mocked(extractPalette).mockResolvedValue({
      seedColor: "#2873c8",
      primary: "#276fbe",
      primaryHover: "#205a9a",
      secondary: "#6786a5",
      surface: "#eef3f8",
      surfaceVariant: "#d7e2ec",
      background: "#f7fafc",
      border: "#94abc0",
      text: "#161920",
      muted: "#575f68",
      ink: "#161920",
      mutedInk: "#575f68",
      accent: "#276fbe",
      route: "light",
      textContrast: 12.4,
      neutralFallback: false,
      competitionDetected: false
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

  it("reloads a saved wallpaper every time its theme is selected", async () => {
    const savedTheme = {
      ...structuredClone(DEFAULT_THEME),
      id: "wallpaper-002",
      name: "002",
      wallpaper: { ...DEFAULT_THEME.wallpaper, file: "002.png" }
    };
    const loadWallpaper = vi.fn(async () => ({
      name: "002.png" as const, mime: "image/png" as const, bytes: Uint8Array.of(137, 80, 78, 71)
    }));
    const fake = api();
    vi.mocked(fake.loadWallpaper).mockImplementation(loadWallpaper);
    vi.mocked(fake.listThemes).mockResolvedValue([
      {
        id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, author: DEFAULT_THEME.author,
        wallpaperFile: DEFAULT_THEME.wallpaper.file, readOnly: true, surfaceColor: "#f1e2d3", accentColor: "#456789"
      },
      {
        id: savedTheme.id, name: savedTheme.name, author: savedTheme.author,
        wallpaperFile: savedTheme.wallpaper.file, readOnly: false, surfaceColor: "#eef3f8", accentColor: "#276fbe"
      }
    ]);
    vi.mocked(fake.loadTheme).mockImplementation(async (id) => id === savedTheme.id ? structuredClone(savedTheme) : structuredClone(DEFAULT_THEME));
    vi.mocked(URL.createObjectURL).mockImplementation((blob) => `blob:${(blob as Blob).type}`);
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);
    loadWallpaper.mockClear();

    const savedCard = root.querySelector<HTMLButtonElement>("[data-theme-id='wallpaper-002']")!;
    savedCard.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.querySelector<HTMLButtonElement>("[data-theme-id='clean-light']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.querySelector<HTMLButtonElement>("[data-theme-id='wallpaper-002']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadWallpaper).toHaveBeenCalledTimes(3);
    expect(root.querySelector<HTMLElement>("[data-role='preview']")!.style.getPropertyValue("--p-wallpaper"))
      .toContain("blob:image/png");
  });

  it("keeps the selected theme when an older wallpaper upload finishes later", async () => {
    const otherTheme = { ...structuredClone(DEFAULT_THEME), id: "other", name: "其他主题" };
    const delayedPalette = deferred<Awaited<ReturnType<typeof extractPalette>>>();
    const fake = api();
    vi.mocked(fake.listThemes).mockResolvedValue([
      {
        id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, author: DEFAULT_THEME.author,
        wallpaperFile: DEFAULT_THEME.wallpaper.file, readOnly: true, surfaceColor: "#f1e2d3", accentColor: "#456789"
      },
      {
        id: otherTheme.id, name: otherTheme.name, author: otherTheme.author,
        wallpaperFile: otherTheme.wallpaper.file, readOnly: false, surfaceColor: "#eef3f8", accentColor: "#276fbe"
      }
    ]);
    vi.mocked(fake.loadTheme).mockImplementation(async (id) => id === otherTheme.id ? structuredClone(otherTheme) : structuredClone(DEFAULT_THEME));
    vi.mocked(fake.loadWallpaper).mockResolvedValue({
      name: "saved.png", mime: "image/png", bytes: Uint8Array.of(137, 80, 78, 71)
    });
    vi.mocked(fake.chooseWallpaper).mockResolvedValue({
      name: "upload.png", mime: "image/png", bytes: Uint8Array.of(1)
    });
    vi.mocked(extractPalette).mockImplementation(() => delayedPalette.promise);
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce("blob:initial")
      .mockReturnValueOnce("blob:other")
      .mockReturnValueOnce("blob:upload");
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    root.querySelector<HTMLButtonElement>(".wallpaper-picker")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.querySelector<HTMLButtonElement>("[data-theme-id='other']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    delayedPalette.resolve({
      seedColor: "#2873c8", primary: "#276fbe", primaryHover: "#205a9a", secondary: "#6786a5",
      surface: "#eef3f8", surfaceVariant: "#d7e2ec", background: "#f7fafc", border: "#94abc0",
      text: "#161920", muted: "#575f68", ink: "#161920", mutedInk: "#575f68", accent: "#276fbe",
      route: "light", textContrast: 12.4, neutralFallback: false, competitionDetected: false
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.saveTheme).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLElement>("[data-role='preview']")!.style.getPropertyValue("--p-wallpaper"))
      .toContain("blob:other");
  });

  it("automatically saves a new image-derived theme from one seed", async () => {
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

    const saved = vi.mocked(fake.saveTheme).mock.calls.at(-1)?.[0].theme;
    expect(fake.saveTheme).toHaveBeenCalledOnce();
    expect(saved?.id).toBe("wallpaper-photo");
    expect(saved?.name).toBe("photo");
    expect(saved?.wallpaper.file).toBe("photo.png");
    expect(saved?.palette.accent).toBe("#276fbe");
    expect(saved?.regions.sidebar.selectedColor).toBe("#6786a5");
    expect(saved?.regions.buttons.primaryColor).toBe("#276fbe");
    expect(saved?.regions.chat.backgroundColor).toBe("#f7fafc");
    expect(saved?.regions.sidebar.textColor).toBe("#161920");
    expect(saved?.regions.chat.textColor).toBe("#161920");
    expect(fake.applyTheme).not.toHaveBeenCalled();
  });

  it("replaces the existing user theme for the same wallpaper filename", async () => {
    const fake = api();
    const existing = {
      ...structuredClone(DEFAULT_THEME),
      id: "wallpaper-photo",
      name: "我调过的照片主题",
      wallpaper: { ...DEFAULT_THEME.wallpaper, file: "photo.png", positionX: 68 }
    };
    vi.mocked(fake.listThemes).mockResolvedValue([
      {
        id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, author: DEFAULT_THEME.author,
        wallpaperFile: DEFAULT_THEME.wallpaper.file, readOnly: true, surfaceColor: "#f1e2d3", accentColor: "#456789"
      },
      {
        id: existing.id, name: existing.name, author: existing.author,
        wallpaperFile: existing.wallpaper.file, readOnly: false, surfaceColor: "#f1e2d3", accentColor: "#456789"
      }
    ]);
    vi.mocked(fake.loadTheme).mockImplementation(async (id) => id === existing.id ? structuredClone(existing) : structuredClone(DEFAULT_THEME));
    vi.mocked(fake.chooseWallpaper).mockResolvedValue({
      name: "photo.png", mime: "image/png", bytes: Uint8Array.of(137, 80, 78, 71)
    });
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    root.querySelector<HTMLButtonElement>(".wallpaper-picker")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.loadTheme).toHaveBeenCalledWith(existing.id);
    const saved = vi.mocked(fake.saveTheme).mock.calls.at(-1)?.[0].theme;
    expect(saved?.id).toBe(existing.id);
    expect(saved?.name).toBe(existing.name);
    expect(saved?.wallpaper.positionX).toBe(68);
  });

  it("adds a suffix when a different wallpaper already uses the generated ID", async () => {
    const fake = api();
    vi.mocked(fake.listThemes).mockResolvedValue([
      {
        id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, author: DEFAULT_THEME.author,
        wallpaperFile: DEFAULT_THEME.wallpaper.file, readOnly: true, surfaceColor: "#f1e2d3", accentColor: "#456789"
      },
      {
        id: "wallpaper-photo", name: "另一张照片", author: DEFAULT_THEME.author,
        wallpaperFile: "other.png", readOnly: false, surfaceColor: "#f1e2d3", accentColor: "#456789"
      }
    ]);
    vi.mocked(fake.chooseWallpaper).mockResolvedValue({
      name: "photo.png", mime: "image/png", bytes: Uint8Array.of(137, 80, 78, 71)
    });
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    root.querySelector<HTMLButtonElement>(".wallpaper-picker")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(fake.saveTheme).mock.calls.at(-1)?.[0].theme.id).toBe("wallpaper-photo-2");
  });

  it("keeps the wallpaper preview and allows a manual retry after autosave fails", async () => {
    const fake = api();
    vi.mocked(fake.chooseWallpaper).mockResolvedValue({
      name: "photo.png", mime: "image/png", bytes: Uint8Array.of(137, 80, 78, 71)
    });
    vi.mocked(fake.saveTheme).mockRejectedValueOnce(new Error("disk failed"));
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    root.querySelector<HTMLButtonElement>(".wallpaper-picker")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector(".preview__wallpaper")).not.toBeNull();
    expect(root.querySelector("[data-role='status']")?.textContent).toBe("操作失败");

    root.querySelector<HTMLButtonElement>("[data-action='save']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.saveTheme).toHaveBeenCalledTimes(2);
  });

  it("keeps the most recently selected wallpaper when an earlier extraction finishes late", async () => {
    const fake = api();
    const firstPalette = deferred<Awaited<ReturnType<typeof extractPalette>>>();
    const derived = {
      seedColor: "#2873c8", primary: "#276fbe", primaryHover: "#205a9a", secondary: "#6786a5",
      surface: "#eef3f8", surfaceVariant: "#d7e2ec", background: "#f7fafc", border: "#94abc0",
      text: "#161920", muted: "#575f68", ink: "#161920", mutedInk: "#575f68", accent: "#276fbe",
      route: "light" as const, textContrast: 12.4, neutralFallback: false, competitionDetected: false
    };
    vi.mocked(extractPalette).mockImplementation((bytes) =>
      new Uint8Array(bytes)[0] === 1 ? firstPalette.promise : Promise.resolve(derived)
    );
    vi.mocked(fake.chooseWallpaper)
      .mockResolvedValueOnce({ name: "first.png", mime: "image/png", bytes: Uint8Array.of(1) })
      .mockResolvedValueOnce({ name: "second.png", mime: "image/png", bytes: Uint8Array.of(2) });
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    const picker = root.querySelector<HTMLButtonElement>(".wallpaper-picker")!;
    picker.click();
    picker.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    firstPalette.resolve(derived);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.saveTheme).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fake.saveTheme).mock.calls[0][0].theme.wallpaper.file).toBe("second.png");
  });

  it("serializes uploads when an earlier autosave is still writing", async () => {
    const fake = api();
    const firstSave = deferred<ThemeSummary>();
    vi.mocked(fake.saveTheme).mockImplementationOnce(() => firstSave.promise);
    vi.mocked(fake.chooseWallpaper)
      .mockResolvedValueOnce({ name: "first.png", mime: "image/png", bytes: Uint8Array.of(1) })
      .mockResolvedValueOnce({ name: "second.png", mime: "image/png", bytes: Uint8Array.of(2) });
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    const picker = root.querySelector<HTMLButtonElement>(".wallpaper-picker")!;
    picker.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.saveTheme).toHaveBeenCalledTimes(1);

    picker.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.saveTheme).toHaveBeenCalledTimes(1);

    firstSave.resolve({
      id: "wallpaper-first", name: "first", author: DEFAULT_THEME.author,
      wallpaperFile: "first.png", readOnly: false, surfaceColor: "#eef3f8", accentColor: "#276fbe"
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.saveTheme).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fake.saveTheme).mock.calls[1][0].theme.wallpaper.file).toBe("second.png");
  });

  it("uses the refreshed theme list to suffix a queued colliding ID", async () => {
    const fake = api();
    const firstSave = deferred<ThemeSummary>();
    const builtIn = {
      id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, author: DEFAULT_THEME.author,
      wallpaperFile: DEFAULT_THEME.wallpaper.file, readOnly: true, surfaceColor: "#f1e2d3", accentColor: "#456789"
    };
    const firstTheme = {
      id: "wallpaper-photo", name: "photo", author: DEFAULT_THEME.author,
      wallpaperFile: "photo.png", readOnly: false, surfaceColor: "#eef3f8", accentColor: "#276fbe"
    };
    vi.mocked(fake.listThemes)
      .mockResolvedValueOnce([builtIn])
      .mockResolvedValueOnce([builtIn, firstTheme])
      .mockResolvedValue([builtIn, firstTheme]);
    vi.mocked(fake.saveTheme).mockImplementationOnce(() => firstSave.promise);
    vi.mocked(fake.chooseWallpaper)
      .mockResolvedValueOnce({ name: "photo.png", mime: "image/png", bytes: Uint8Array.of(1) })
      .mockResolvedValueOnce({ name: "photo.jpg", mime: "image/jpeg", bytes: Uint8Array.of(2) });
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    const picker = root.querySelector<HTMLButtonElement>(".wallpaper-picker")!;
    picker.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    picker.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    firstSave.resolve(firstTheme);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(fake.saveTheme).mock.calls[1][0].theme.id).toBe("wallpaper-photo-2");
  });
});
