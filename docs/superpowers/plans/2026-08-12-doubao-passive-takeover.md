# 豆包普通启动自动接管 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 豆包未运行时守护只等待；用户普通启动豆包后，按提醒设置确认或无提示切换到皮肤模式并恢复主题。

**Architecture:** 保留现有 `probeDoubaoPort` 对 `stopped` 与 `restart-required` 的区分。修改 `SkinGuardian` 状态机，使 `stopped` 不再调用 `launch`；仅 `restart-required` 可以触发受控重启。运行时装配和 IPC 不新增公共能力，只调整等待间隔和状态含义。

**Tech Stack:** Electron Forge、TypeScript、现有 CDP 与 SkinGuardian、Vitest。

## Global Constraints

- Windows only；CDP 只允许 `127.0.0.1:9225`。
- 不修改豆包安装文件，不劫持快捷方式，不新增依赖。
- `stopped` 永远不得调用 `launchDoubao`。
- `restart-required` 且提醒关闭时，才允许自动关闭并以皮肤模式重启。
- 暂时停用皮肤时不探测、不弹窗、不关闭、不启动、不注入。
- 关闭失败后不得启动第二个豆包实例。
- 正式项目为 `E:\Marvis\Documents\ChatGPT\豆包皮肤工具`，最终合并回本地 `master`。

---

### Task 1: 修正守护状态机

**Files:**
- Modify: `src/main/skin-guardian.ts`
- Modify: `tests/skin-guardian.test.ts`

**Interfaces:**
- `GuardianResult` 增加 `"waiting-for-doubao"`。
- `SkinGuardian.runOnce()` 在 `probe.kind === "stopped"` 时返回 `"waiting-for-doubao"`。
- 删除 `stopped` 分支对 `dependencies.launch()` 的调用；保留接口以避免无关重构。

- [ ] **Step 1: Write the failing tests**

```ts
it("waits without launching when Doubao is stopped", async () => {
  const { guardian, launch, apply } = guardianWith(["stopped"]);
  await expect(guardian.runOnce()).resolves.toBe("waiting-for-doubao");
  expect(launch).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
});

it("keeps waiting across repeated stopped probes", async () => {
  const { guardian, launch } = guardianWith(["stopped", "stopped"]);
  await guardian.runOnce();
  await guardian.runOnce();
  expect(launch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm.cmd test -- tests/skin-guardian.test.ts`

Expected: FAIL because current `stopped` branch returns `retry` and calls `launch`.

- [ ] **Step 3: Implement minimum fix**

```ts
if (probe.kind === "stopped") {
  this.applied = false;
  this.launched = false;
  return "waiting-for-doubao";
}
```

Do not change `restart-required` behavior.

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm.cmd test -- tests/skin-guardian.test.ts`

Expected: PASS.

### Task 2: 固化探测映射与等待频率

**Files:**
- Modify: `src/main/skin-guardian.ts`
- Modify: `tests/skin-guardian.test.ts`
- Modify: `tests/doubao-launcher.test.ts`

**Interfaces:**
- `probeDoubaoPort()` 保持：CDP 失败且进程存在为 `restart-required`；进程不存在为 `stopped`。
- `waiting-for-doubao` 下一次探测间隔固定为 750 毫秒。
- 其他失败继续使用现有退避。

- [ ] **Step 1: Write failing mapping and timer tests**

```ts
it("maps failed CDP with no process to stopped", async () => {
  await expect(probeDoubaoPort(9225, adapter, {
    fetcher: vi.fn(async () => { throw new Error("offline"); }),
    isRunning: vi.fn(async () => false)
  })).resolves.toEqual({ kind: "stopped" });
});

it("maps failed CDP with a process to restart-required", async () => {
  await expect(probeDoubaoPort(9225, adapter, {
    fetcher: vi.fn(async () => { throw new Error("offline"); }),
    isRunning: vi.fn(async () => true)
  })).resolves.toEqual({ kind: "restart-required" });
});

it("polls stopped Doubao again after 750 ms", async () => {
  await guardian.start();
  expect(delay).toHaveBeenCalledWith(750, expect.any(Function));
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm.cmd test -- tests/skin-guardian.test.ts tests/doubao-launcher.test.ts`

Expected: timer assertion fails until `waiting-for-doubao` gets a dedicated interval.

- [ ] **Step 3: Implement dedicated interval**

```ts
const delay = result === "applied"
  ? 5_000
  : result === "waiting-for-doubao"
    ? 750
    : BACKOFF[this.retry];
```

Do not increment failure backoff for `waiting-for-doubao`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm.cmd test -- tests/skin-guardian.test.ts tests/doubao-launcher.test.ts`

Expected: PASS.

### Task 3: 回归验证与发布

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/release-win.test.ts`

- [ ] **Step 1: Update release assertion**

```ts
expect(packageJson.version).toBe("0.1.13");
```

- [ ] **Step 2: Set package version**

Set root package and lockfile package version to `0.1.13`.

- [ ] **Step 3: Run full verification**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd test`

Expected: all tests pass.

Run: `npm.cmd run release:win`

Expected: setup and portable artifacts are generated under formal project `out`.

- [ ] **Step 4: Manual acceptance**

1. Keep skin app running while Doubao is fully closed for 30 seconds; verify Doubao remains closed.
2. With reminder enabled, launch ordinary Doubao; verify one prompt, cancel leaves it open.
3. With reminder disabled, launch ordinary Doubao; verify no prompt, controlled restart and saved skin restoration.
4. Exit Doubao from Task Manager; verify it stays closed.
5. Launch Doubao with 9225; verify skin restores without restart.
6. Enable temporary disable; verify ordinary Doubao is untouched.

- [ ] **Step 5: Commit and merge locally**

```bash
git add src/main/skin-guardian.ts tests/skin-guardian.test.ts tests/doubao-launcher.test.ts package.json package-lock.json tests/release-win.test.ts
git commit -m "fix: keep Doubao closed until user launch"
```

After final verification, merge feature work back to local `master` and keep generated `master/out` artifacts.
