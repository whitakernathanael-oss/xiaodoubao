// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp } from "../src/renderer/app";
import type { DoubaoSkinApi } from "../src/shared/ipc";
import { DEFAULT_THEME } from "../src/shared/defaults";

function api(): DoubaoSkinApi {
  return {
    listThemes: vi.fn(async () => [{
      id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, author: DEFAULT_THEME.author,
      wallpaperFile: DEFAULT_THEME.wallpaper.file, readOnly: false
    }]),
    loadTheme: vi.fn(async () => structuredClone(DEFAULT_THEME)),
    saveTheme: vi.fn(async (input) => ({
      id: input.theme.id, name: input.theme.name, author: input.theme.author,
      wallpaperFile: input.theme.wallpaper.file, readOnly: false
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
  beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; });

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
});
