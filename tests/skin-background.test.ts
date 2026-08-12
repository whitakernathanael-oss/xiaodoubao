import { describe, expect, it, vi } from "vitest";
import { reconcileSkinBackground, shouldKeepSkinBackground } from "../src/main/skin-background";

function dependencies() {
  return {
    stopGuardian: vi.fn(),
    startGuardian: vi.fn(),
    installStartup: vi.fn(),
    removeStartup: vi.fn(),
  };
}

describe("shouldKeepSkinBackground", () => {
  it.each([
    [true, true, false, true],
    [false, true, false, false],
    [true, false, false, false],
    [true, true, true, false],
  ])("returns %s for %s, %s, %s", (persistence, active, disabled, expected) => {
    expect(shouldKeepSkinBackground(persistence, active, disabled)).toBe(expected);
  });
});

describe("reconcileSkinBackground", () => {
  it("stops guardian and removes startup entry when temporarily disabled", async () => {
    const deps = dependencies();
    await reconcileSkinBackground({ temporarilyDisabled: true, shouldRun: true, manageStartup: true }, deps);
    expect(deps.stopGuardian).toHaveBeenCalledOnce();
    expect(deps.removeStartup).toHaveBeenCalledOnce();
    expect(deps.startGuardian).not.toHaveBeenCalled();
  });

  it("does not keep guardian resident without an active skin", async () => {
    const deps = dependencies();
    await reconcileSkinBackground({ temporarilyDisabled: false, shouldRun: false, manageStartup: true }, deps);
    expect(deps.stopGuardian).toHaveBeenCalledOnce();
    expect(deps.removeStartup).toHaveBeenCalledOnce();
    expect(deps.startGuardian).not.toHaveBeenCalled();
  });

  it("restores startup entry and guardian when an active skin exists", async () => {
    const deps = dependencies();
    await reconcileSkinBackground({ temporarilyDisabled: false, shouldRun: true, manageStartup: true }, deps);
    expect(deps.installStartup).toHaveBeenCalledOnce();
    expect(deps.startGuardian).toHaveBeenCalledOnce();
  });

  it("starts the current guardian and returns startup installation errors", async () => {
    const deps = dependencies();
    const error = new Error("startup failed");
    deps.installStartup.mockRejectedValueOnce(error);
    await expect(
      reconcileSkinBackground({ temporarilyDisabled: false, shouldRun: true, manageStartup: true }, deps)
    ).rejects.toBe(error);
    expect(deps.startGuardian).toHaveBeenCalledOnce();
  });

  it("does not touch startup entries when startup management is disabled", async () => {
    const deps = dependencies();
    await reconcileSkinBackground({ temporarilyDisabled: false, shouldRun: true, manageStartup: false }, deps);
    expect(deps.installStartup).not.toHaveBeenCalled();
    expect(deps.removeStartup).not.toHaveBeenCalled();
    expect(deps.startGuardian).toHaveBeenCalledOnce();
  });
});
