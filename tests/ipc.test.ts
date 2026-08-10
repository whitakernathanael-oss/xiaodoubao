import { describe, expect, it, vi } from "vitest";
import { registerIpcHandlers, type IpcServices } from "../src/main/ipc-handlers";
import { IPC_CHANNELS } from "../src/shared/ipc";

function services(): IpcServices {
  return {
    listThemes: vi.fn(), loadTheme: vi.fn(), loadWallpaper: vi.fn(), saveTheme: vi.fn(), deleteTheme: vi.fn(),
    duplicateTheme: vi.fn(), importTheme: vi.fn(), exportTheme: vi.fn(), chooseWallpaper: vi.fn(),
    getStatus: vi.fn(), startDoubao: vi.fn(), confirmRestart: vi.fn(), applyTheme: vi.fn(),
    restoreOfficial: vi.fn(), chooseDoubaoExecutable: vi.fn(),
    getSkinPersistence: vi.fn(), setSkinPersistence: vi.fn(), getSkinAutomation: vi.fn(), setSkinAutomation: vi.fn()
  };
}

describe("bounded IPC", () => {
  it("exposes only the documented channels", () => {
    expect(Object.values(IPC_CHANNELS).sort()).toEqual([
      "adapter:status", "doubao:choose-executable", "doubao:restart",
      "doubao:start", "skin:apply", "skin:automation:get", "skin:automation:set", "skin:persistence:get", "skin:persistence:set", "skin:restore",
      "theme:delete", "theme:duplicate", "theme:export", "theme:import",
      "theme:list", "theme:load", "theme:save", "wallpaper:choose", "wallpaper:load"
    ].sort());
  });

  it("registers and removes each exact handler", () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)),
      removeHandler: vi.fn((channel: string) => handlers.delete(channel))
    };
    const cleanup = registerIpcHandlers(services(), ipcMain);
    expect([...handlers.keys()].sort()).toEqual(Object.values(IPC_CHANNELS).sort());
    cleanup();
    expect(handlers.size).toBe(0);
  });

  it("rejects an invalid theme id at the boundary", async () => {
    const loadTheme = vi.fn();
    const current = { ...services(), loadTheme };
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    registerIpcHandlers(current, {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: () => undefined
    });

    await expect(handlers.get(IPC_CHANNELS.themeLoad)?.({}, "../escape")).rejects.toThrow(/theme id/i);
    expect(loadTheme).not.toHaveBeenCalled();
  });

  it("accepts only a boolean persistence setting", async () => {
    const current = { ...services(), setSkinPersistence: vi.fn(async () => ({ enabled: true })) };
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    registerIpcHandlers(current, { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: () => undefined });

    await expect(handlers.get(IPC_CHANNELS.skinPersistenceSet)?.({}, true)).resolves.toEqual({ enabled: true });
    await expect(handlers.get(IPC_CHANNELS.skinPersistenceSet)?.({}, "true")).rejects.toThrow(/boolean/i);
  });

  it("accepts only known boolean automation settings", async () => {
    const current = { ...services(), setSkinAutomation: vi.fn(async () => ({ confirmBeforeRestart: true, temporarilyDisabled: false })) };
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    registerIpcHandlers(current, { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: () => undefined });
    await expect(handlers.get(IPC_CHANNELS.skinAutomationSet)?.({}, { temporarilyDisabled: true })).resolves.toEqual({ confirmBeforeRestart: true, temporarilyDisabled: false });
    await expect(handlers.get(IPC_CHANNELS.skinAutomationSet)?.({}, { temporarilyDisabled: "true" })).rejects.toThrow(/boolean/i);
  });
});
