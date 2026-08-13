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
  it("schedules the next stopped probe after 750ms", async () => {
    const delays: number[] = [];
    const guardian = new SkinGuardian({
      loadState: vi.fn(async () => state),
      probe: vi.fn(async () => ({ kind: "stopped" as const })),
      launch: vi.fn(),
      apply: vi.fn(async () => ({ kind: "applied" as const })),
      delay: (milliseconds, _callback) => { delays.push(milliseconds); return setTimeout(() => undefined, 0); }
    });

    await guardian.start();
    expect(delays[0]).toBe(750);
    guardian.stop();
  });

  it("does not let stopped polling consume retry backoff", async () => {
    const delays: number[] = [];
    const callbacks: Array<() => void> = [];
    const probe = vi.fn()
      .mockResolvedValueOnce({ kind: "stopped" as const })
      .mockResolvedValueOnce({ kind: "port-conflict" as const })
      .mockResolvedValueOnce({ kind: "port-conflict" as const });
    const guardian = new SkinGuardian({
      loadState: vi.fn(async () => state), probe,
      launch: vi.fn(), apply: vi.fn(async () => ({ kind: "applied" as const })),
      delay: (milliseconds, callback) => { delays.push(milliseconds); callbacks.push(callback); return setTimeout(() => undefined, 0); }
    });

    await guardian.start();
    callbacks.shift()?.();
    await vi.waitFor(() => expect(delays).toHaveLength(2));
    callbacks.shift()?.();
    await vi.waitFor(() => expect(delays).toHaveLength(3));
    expect(delays).toEqual([750, 1_000, 2_000]);
    guardian.stop();
  });

  it("resets retry backoff after stop and start", async () => {
    const delays: number[] = [];
    const callbacks: Array<() => void> = [];
    const guardian = new SkinGuardian({
      loadState: vi.fn(async () => state),
      probe: vi.fn(async () => ({ kind: "port-conflict" as const })),
      launch: vi.fn(), apply: vi.fn(async () => ({ kind: "applied" as const })),
      delay: (milliseconds, callback) => { delays.push(milliseconds); callbacks.push(callback); return setTimeout(() => undefined, 0); }
    });
    await guardian.start();
    callbacks.shift()?.();
    await vi.waitFor(() => expect(delays).toHaveLength(2));
    guardian.stop();
    await guardian.start();
    expect(delays).toEqual([1_000, 2_000, 1_000]);
    guardian.stop();
  });

  it("waits without launching when Doubao is stopped", async () => {
    const { guardian, launch, apply } = guardianWith(["stopped"]);

    await expect(guardian.runOnce()).resolves.toBe("waiting-for-doubao");
    expect(launch).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
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

  it("recovers a pending takeover when the next probe is stopped", async () => {
    const launch = vi.fn();
    const restartRunningDoubao = vi.fn(async () => false);
    const probe = vi.fn()
      .mockResolvedValueOnce({ kind: "restart-required" as const })
      .mockResolvedValueOnce({ kind: "stopped" as const });
    const guardian = new SkinGuardian({
      loadState: vi.fn(async () => state), probe, launch,
      apply: vi.fn(async () => ({ kind: "applied" as const })),
      shouldRestartRunningDoubao: () => true, restartRunningDoubao,
      delay: (milliseconds, callback) => setTimeout(callback, milliseconds)
    });

    await expect(guardian.runOnce()).resolves.toBe("waiting-for-restart");
    await expect(guardian.runOnce()).resolves.toBe("retry");
    expect(launch).toHaveBeenCalledWith(state.doubaoExecutable, state.port);
  });

  it("returns retry when pending takeover launch throws", async () => {
    const launch = vi.fn(() => { throw new Error("launch failed"); });
    const probe = vi.fn()
      .mockResolvedValueOnce({ kind: "restart-required" as const })
      .mockResolvedValueOnce({ kind: "stopped" as const });
    const guardian = new SkinGuardian({
      loadState: vi.fn(async () => state), probe, launch,
      apply: vi.fn(async () => ({ kind: "applied" as const })),
      shouldRestartRunningDoubao: () => true, restartRunningDoubao: vi.fn(async () => false),
      delay: (milliseconds, callback) => setTimeout(callback, milliseconds)
    });

    await guardian.runOnce();
    await expect(guardian.runOnce()).resolves.toBe("retry");
  });

  it("clears pending takeover on stop before a stopped probe", async () => {
    const launch = vi.fn();
    const apply = vi.fn(async () => ({ kind: "applied" as const }));
    const probe = vi.fn()
      .mockResolvedValueOnce({ kind: "restart-required" as const })
      .mockResolvedValueOnce({ kind: "stopped" as const });
    const guardian = new SkinGuardian({
      loadState: vi.fn(async () => state), probe, launch, apply,
      shouldRestartRunningDoubao: () => true,
      restartRunningDoubao: vi.fn(async () => false),
      delay: (milliseconds, callback) => setTimeout(callback, milliseconds)
    });

    await guardian.runOnce();
    guardian.stop();
    await guardian.start();
    guardian.stop();
    expect(launch).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("clears pending takeover when active state is deleted", async () => {
    const launch = vi.fn();
    const apply = vi.fn(async () => ({ kind: "applied" as const }));
    const loadState = vi.fn()
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce(undefined);
    const guardian = new SkinGuardian({
      loadState, probe: vi.fn(async () => ({ kind: "restart-required" as const })), launch, apply,
      shouldRestartRunningDoubao: () => true,
      restartRunningDoubao: vi.fn(async () => false),
      delay: (milliseconds, callback) => setTimeout(callback, milliseconds)
    });

    await guardian.runOnce();
    await expect(guardian.runOnce()).resolves.toBe("disabled");
    expect(launch).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it.each(["applied", "partial"] as const)("clears pending takeover after connected %s apply", async (kind) => {
    const launch = vi.fn();
    const apply = vi.fn(async () => ({ kind }));
    const probe = vi.fn()
      .mockResolvedValueOnce({ kind: "restart-required" as const })
      .mockResolvedValueOnce({ kind: "connected" as const, targets: [] })
      .mockResolvedValueOnce({ kind: "stopped" as const });
    const guardian = new SkinGuardian({
      loadState: vi.fn(async () => state), probe, launch, apply,
      shouldRestartRunningDoubao: () => true,
      restartRunningDoubao: vi.fn(async () => false),
      delay: (milliseconds, callback) => setTimeout(callback, milliseconds)
    });

    await guardian.runOnce();
    await expect(guardian.runOnce()).resolves.toBe(kind === "partial" ? "applied" : "applied");
    await expect(guardian.runOnce()).resolves.toBe("waiting-for-doubao");
    expect(launch).not.toHaveBeenCalled();
  });

  it("keeps waiting across repeated stopped probes", async () => {
    const { guardian, launch } = guardianWith(["stopped", "stopped"]);

    await guardian.runOnce();
    await guardian.runOnce();

    expect(launch).not.toHaveBeenCalled();
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
