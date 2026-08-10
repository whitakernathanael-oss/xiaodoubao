import { describe, expect, it, vi } from "vitest";
import { SkinGuardian } from "../src/main/skin-guardian";
import type { DoubaoPortStatus } from "../src/main/doubao-launcher";

const state = {
  version: 1 as const,
  themeId: "wallpaper-002",
  port: 9225,
  doubaoExecutable: "C:\\Apps\\Doubao.exe",
  updatedAt: "2026-08-10T00:00:00.000Z"
};

function guardianWith(probeKinds: Array<"connected" | "restart-required" | "stopped" | "port-conflict">) {
  const launch = vi.fn();
  const apply = vi.fn(async () => ({ kind: "applied" as const }));
  const probe = vi.fn(async (): Promise<DoubaoPortStatus> => {
    const kind = probeKinds.shift() ?? "connected";
    return kind === "connected" ? { kind, targets: [] } : { kind };
  });
  const guardian = new SkinGuardian({
    loadState: vi.fn(async () => state),
    probe,
    launch,
    apply,
    delay: (milliseconds, callback) => setTimeout(callback, milliseconds)
  });
  return { guardian, launch, apply, probe };
}

describe("skin guardian", () => {
  it("starts closed Doubao then applies saved theme once CDP is ready", async () => {
    const { guardian, launch, apply } = guardianWith(["stopped", "connected"]);

    await expect(guardian.runOnce()).resolves.toBe("retry");
    await expect(guardian.runOnce()).resolves.toBe("applied");

    expect(launch).toHaveBeenCalledWith("C:\\Apps\\Doubao.exe", 9225);
    expect(apply).toHaveBeenCalledWith("wallpaper-002", 9225);
  });

  it("does not close or relaunch a running Doubao without CDP", async () => {
    const { guardian, launch, apply } = guardianWith(["restart-required"]);

    await expect(guardian.runOnce()).resolves.toBe("waiting-for-restart");

    expect(launch).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("restarts normal Doubao when restart confirmation is disabled", async () => {
    const restartRunningDoubao = vi.fn(async () => true);
    const { guardian } = guardianWith(["restart-required"]);
    const automatic = new SkinGuardian({
      loadState: vi.fn(async () => state), probe: vi.fn(async () => ({ kind: "restart-required" as const })),
      launch: vi.fn(), apply: vi.fn(async () => ({ kind: "applied" as const })),
      shouldRestartRunningDoubao: () => true, restartRunningDoubao,
      delay: (milliseconds, callback) => setTimeout(callback, milliseconds)
    });
    await expect(automatic.runOnce()).resolves.toBe("retry");
    expect(restartRunningDoubao).toHaveBeenCalledWith(9225);
    guardian.stop();
  });

  it("does not repeatedly launch while it waits for the same CDP startup", async () => {
    const { guardian, launch } = guardianWith(["stopped", "stopped"]);

    await guardian.runOnce();
    await guardian.runOnce();

    expect(launch).toHaveBeenCalledOnce();
  });

  it("does not launch or apply after stop while state is still loading", async () => {
    let releaseState: ((value: typeof state) => void) | undefined;
    const launch = vi.fn();
    const apply = vi.fn(async () => ({ kind: "applied" as const }));
    const guardian = new SkinGuardian({
      loadState: () => new Promise((resolve) => { releaseState = resolve; }),
      probe: vi.fn(async () => ({ kind: "stopped" as const })),
      launch,
      apply,
      delay: (milliseconds, callback) => setTimeout(callback, milliseconds)
    });

    const running = guardian.runOnce();
    guardian.stop();
    releaseState?.(state);

    await expect(running).resolves.toBe("disabled");
    expect(launch).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rolls back a theme that finishes applying after stop", async () => {
    let releaseApply: ((value: { kind: "applied" }) => void) | undefined;
    const rollback = vi.fn(async () => undefined);
    const apply = vi.fn(() => new Promise<{ kind: "applied" }>((resolve) => { releaseApply = resolve; }));
    const guardian = new SkinGuardian({
      loadState: vi.fn(async () => state),
      probe: vi.fn(async () => ({ kind: "connected" as const, targets: [] })),
      launch: vi.fn(),
      apply,
      rollback,
      delay: (milliseconds, callback) => setTimeout(callback, milliseconds)
    });

    const running = guardian.runOnce();
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
    guardian.stop();
    releaseApply?.({ kind: "applied" });

    await expect(running).resolves.toBe("disabled");
    expect(rollback).toHaveBeenCalledWith("wallpaper-002");
  });
});
