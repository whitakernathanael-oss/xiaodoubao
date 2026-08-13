// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    chooseDoubaoExecutable: vi.fn(),
    getSkinPersistence: vi.fn(async () => ({ enabled: true })),
    setSkinPersistence: vi.fn(async (enabled: boolean) => ({ enabled })),
    getSkinAutomation: vi.fn(async () => ({ confirmBeforeRestart: true, temporarilyDisabled: false })),
    setSkinAutomation: vi.fn(async (settings: { confirmBeforeRestart?: boolean; temporarilyDisabled?: boolean }) => ({ confirmBeforeRestart: settings.confirmBeforeRestart ?? true, temporarilyDisabled: settings.temporarilyDisabled ?? false }))
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve };
}

describe("single-window editor", () => {
  it("removes the wordmark while keeping topbar controls right-aligned", async () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, api());
    expect(root.querySelector(".wordmark")).toBeNull();
    expect(root.querySelector<HTMLElement>(".topbar")!.innerHTML).not.toContain("小豆包");
    const css = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");
    expect(css).toMatch(/\.topbar__status\s*\{[^}]*margin-left:\s*auto/);
  });
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
    expect(root.querySelector("[data-action='persistence']")).not.toBeNull();
    expect(root.querySelector("[data-action='confirm-before-restart']")).not.toBeNull();
    expect(root.querySelector("[data-action='temporarily-disable-skin']")).not.toBeNull();

    root.querySelector<HTMLButtonElement>("[data-action='apply']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.applyTheme).toHaveBeenCalledOnce();
    expect(fake.applyTheme).toHaveBeenCalledWith(DEFAULT_THEME.id);
  });

  it("keeps automation controls out of the top bar", async () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, api());
    for (const action of ["persistence", "confirm-before-restart", "temporarily-disable-skin"]) {
      expect(root.querySelector(`.topbar [data-action='${action}']`)).toBeNull();
      expect(root.querySelector(`.automation-panel [data-action='${action}']`)).not.toBeNull();
    }
  });

  it("places temporary-disable guidance inside automation settings", async () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, api());
    const guidance = root.querySelector(".automation-panel [data-role='temporary-disable-help']");
    expect(guidance?.textContent).toContain("暂停后台检测与开机启动");
    expect(guidance?.textContent).toContain("不删除已保存主题");
    expect(root.querySelector(".topbar")?.textContent).not.toContain("暂停后台检测与开机启动");
  });

  it("ships the neutral responsive workspace styles", () => {
    const css = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");
    expect(css).toContain(".automation-panel");
    expect(css).toContain('[data-role="temporary-disable-help"]');
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).not.toContain("#7257dd");
    expect(css).not.toContain("#7257df");
    expect(css).not.toContain("#8a62de");
    expect(css).not.toContain(".panel-title > button");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("::selection");
    expect(css).toContain("scrollbar");
    expect(css).toContain(".wallpaper-picker small");
    expect(css).toContain(".control-row");
    expect(css).toContain('.range-control input[type="number"]');
  });

  it("opens the topbar more-actions menu downward inside the app shell", () => {
    const css = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");
    const rule = css.match(/\.more-actions button\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("top:calc(100% + 4px)");
    expect(rule).toContain("right:0");
    expect(rule).not.toContain("bottom:");
  });

  it("keeps theme cards tall enough for their swatch and uses native button geometry", () => {
    const css = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");
    const rule = css.match(/\.theme-card\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/min-height\s*:\s*58px/);
    expect(rule).toContain("appearance:none");
  });

  it("uses green status only for healthy states", async () => {
    const fake = api();
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);
    const indicator = root.querySelector<HTMLElement>(".topbar__status")!;
    expect(indicator.dataset.statusKind).toBe("not-running");
    expect(indicator.querySelector("i")).not.toBeNull();
    vi.mocked(fake.startDoubao).mockResolvedValue({ kind: "applied" });
    root.querySelector<HTMLButtonElement>("[data-action='start']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(indicator.dataset.statusKind).toBe("applied");
  });

  it("separates restore from save and apply actions", async () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, api());
    expect(root.querySelector(".actionbar__restore [data-action='restore']")).not.toBeNull();
    expect(root.querySelector(".actionbar__commit [data-action='save']")).not.toBeNull();
    expect(root.querySelector(".actionbar__commit [data-action='apply']")).not.toBeNull();
    expect(root.querySelector(".actionbar__restore [data-action='save']")).toBeNull();
  });

  it("shows the selected theme in the topbar and keeps delete in a more menu", async () => {
    const second = { ...structuredClone(DEFAULT_THEME), id: "second", name: "第二主题" };
    const fake = api();
    vi.mocked(fake.listThemes).mockResolvedValue([
      { id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, author: DEFAULT_THEME.author, wallpaperFile: DEFAULT_THEME.wallpaper.file, readOnly: false, surfaceColor: "#f1e2d3", accentColor: "#456789" },
      { id: second.id, name: second.name, author: second.author, wallpaperFile: second.wallpaper.file, readOnly: false, surfaceColor: "#eee", accentColor: "#123" }
    ]);
    vi.mocked(fake.loadTheme).mockImplementation(async (id) => id === second.id ? structuredClone(second) : structuredClone(DEFAULT_THEME));
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);
    expect(root.querySelector("[data-role='current-theme']")?.textContent).toContain(DEFAULT_THEME.name);
    expect(root.querySelector(".theme-tools [data-action='delete']")).toBeNull();
    expect(root.querySelector(".theme-panel [data-action='delete']")).toBeNull();
    expect(root.querySelector(".topbar .more-actions [data-action='delete']")).not.toBeNull();
    root.querySelector<HTMLButtonElement>("[data-theme-id='second']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector("[data-role='current-theme']")?.textContent).toContain("第二主题");
    root.querySelector<HTMLButtonElement>(".topbar .more-actions [data-action='delete']")!.click();
    expect(fake.deleteTheme).toHaveBeenCalledWith(second.id);
  });

  it("persists relocated automation settings", async () => {
    const fake = api();
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);
    root.querySelector<HTMLInputElement>("[data-action='confirm-before-restart']")!.click();
    root.querySelector<HTMLInputElement>("[data-action='temporarily-disable-skin']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.setSkinAutomation).toHaveBeenLastCalledWith({ confirmBeforeRestart: false, temporarilyDisabled: true });
  });

  it("saves and reapplies the current theme before enabling persistence", async () => {
    const fake = api();
    vi.mocked(fake.getSkinPersistence).mockResolvedValue({ enabled: false });
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    root.querySelector<HTMLInputElement>("[data-action='persistence']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.saveTheme).toHaveBeenCalledOnce();
    expect(fake.setSkinPersistence).toHaveBeenCalledWith(true);
    expect(fake.applyTheme).toHaveBeenCalledWith(DEFAULT_THEME.id);
    expect(vi.mocked(fake.saveTheme).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(fake.setSkinPersistence).mock.invocationCallOrder[0]);
    expect(vi.mocked(fake.setSkinPersistence).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(fake.applyTheme).mock.invocationCallOrder[0]);
    expect(root.querySelector("[data-role='status']")?.textContent).toBe("自动保持皮肤已开启");
  });

  it("ignores an enable that finishes after persistence was disabled", async () => {
    const fake = api();
    const save = deferred<ThemeSummary>();
    vi.mocked(fake.getSkinPersistence).mockResolvedValue({ enabled: false });
    vi.mocked(fake.saveTheme).mockImplementation(() => save.promise);
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    const checkbox = root.querySelector<HTMLInputElement>("[data-action='persistence']")!;
    checkbox.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    checkbox.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    save.resolve({ id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, author: DEFAULT_THEME.author, wallpaperFile: DEFAULT_THEME.wallpaper.file, readOnly: false, surfaceColor: "#f1e2d3", accentColor: "#456789" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.setSkinPersistence).toHaveBeenCalledWith(false);
    expect(fake.applyTheme).not.toHaveBeenCalled();
    expect(root.querySelector("[data-role='status']")?.textContent).not.toBe("自动保持皮肤已开启");
  });

  it("serializes rapid enable-disable-enable persistence intent", async () => {
    const fake = api();
    const firstEnable = deferred<{ enabled: boolean }>();
    vi.mocked(fake.getSkinPersistence).mockResolvedValue({ enabled: false });
    vi.mocked(fake.setSkinPersistence).mockImplementation((enabled: boolean) => enabled && vi.mocked(fake.setSkinPersistence).mock.calls.length === 1 ? firstEnable.promise : Promise.resolve({ enabled }));
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);
    const checkbox = root.querySelector<HTMLInputElement>("[data-action='persistence']")!;

    checkbox.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    checkbox.click();
    checkbox.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.setSkinPersistence).toHaveBeenCalledTimes(1);

    firstEnable.resolve({ enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(fake.setSkinPersistence).mock.calls.map(([enabled]) => enabled)).toEqual([true, false, true]);
    expect(fake.applyTheme).toHaveBeenCalledOnce();
    expect(root.querySelector("[data-role='status']")?.textContent).toBe("自动保持皮肤已开启");
  });

  it("does not enable or apply when restore invalidates a pending save", async () => {
    const fake = api();
    const save = deferred<ThemeSummary>();
    vi.mocked(fake.getSkinPersistence).mockResolvedValue({ enabled: false });
    vi.mocked(fake.saveTheme).mockImplementation(() => save.promise);
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);
    const checkbox = root.querySelector<HTMLInputElement>("[data-action='persistence']")!;

    checkbox.click();
    root.querySelector<HTMLButtonElement>("[data-action='restore']")!.click();
    save.resolve({ id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, author: DEFAULT_THEME.author, wallpaperFile: DEFAULT_THEME.wallpaper.file, readOnly: false, surfaceColor: "#f1e2d3", accentColor: "#456789" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.restoreOfficial).toHaveBeenCalledOnce();
    expect(fake.setSkinPersistence).not.toHaveBeenCalledWith(true);
    expect(fake.applyTheme).not.toHaveBeenCalled();
  });

  it("does not report persistence enabled when applying the theme fails", async () => {
    const fake = api();
    vi.mocked(fake.getSkinPersistence).mockResolvedValue({ enabled: false });
    vi.mocked(fake.applyTheme).mockResolvedValue({ kind: "error", message: "无法连接" });
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    root.querySelector<HTMLInputElement>("[data-action='persistence']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector("[data-role='status']")?.textContent).not.toBe("自动保持皮肤已开启");
  });

  it("syncs persistence after restoring the official appearance", async () => {
    const fake = api();
    vi.mocked(fake.getSkinPersistence)
      .mockResolvedValueOnce({ enabled: true })
      .mockResolvedValueOnce({ enabled: false });
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    const checkbox = root.querySelector<HTMLInputElement>("[data-action='persistence']")!;
    expect(checkbox.checked).toBe(true);
    root.querySelector<HTMLButtonElement>("[data-action='restore']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.restoreOfficial).toHaveBeenCalledOnce();
    expect(fake.getSkinPersistence).toHaveBeenCalledTimes(2);
    expect(checkbox.checked).toBe(false);
  });

  it("keeps persistence checked when restoring the official appearance fails", async () => {
    const fake = api();
    vi.mocked(fake.restoreOfficial).mockRejectedValue(new Error("restore failed"));
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, fake);

    const checkbox = root.querySelector<HTMLInputElement>("[data-action='persistence']")!;
    expect(checkbox.checked).toBe(true);
    root.querySelector<HTMLButtonElement>("[data-action='restore']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.getSkinPersistence).toHaveBeenCalledOnce();
    expect(checkbox.checked).toBe(true);
  });

  it("explains that temporary disable stops background and startup", async () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    await mountApp(root, api());
    expect(root.textContent).toContain("暂停后台检测与开机启动");
    expect(root.textContent).toContain("不会立即移除当前豆包皮肤");
    expect(root.textContent).toContain("有已保存主题时恢复后台运行");
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
