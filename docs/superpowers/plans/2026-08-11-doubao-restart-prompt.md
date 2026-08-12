# 豆包皮肤模式重启提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当普通豆包已运行时，按用户设置询问或自动关闭并以皮肤模式重启；支持完全临时停用皮肤自动行为。

**Architecture:** 在现有持续恢复功能的 `AppSettings` 中增加两个布尔设置。`SkinGuardian` 只负责判定与恢复，遇到普通豆包时向主进程请求一次受控重启；主窗口负责确认对话。关闭、启动与注入继续复用 `doubao-launcher.ts`、`SkinWorkflow` 和现有 CDP 流程。

**Tech Stack:** Electron Forge、TypeScript、Node child process、现有 CDP、SkinGuardian、Vitest。

## Global Constraints

- 先基于 `codex/skin-persistence` 持续恢复实现执行；该实现须已有 `SkinGuardian`、`SkinStateStore`、`skinPersistenceEnabled`。
- Windows only；CDP 只允许 `127.0.0.1:9225`。
- 不改豆包安装文件；不新增依赖；不增加托盘菜单。
- `skinTemporarilyDisabled=true` 时，绝不关闭、启动、注入或提示豆包。
- 自动关闭前必须先由设置决定是否显示风险提示；确认文案必须说明未发送文字可能丢失。
- 关闭只限已识别豆包主进程及子进程；失败使用 1s、2s、4s、8s、16s、30s 退避，不循环强杀。

---

### Task 1: 设置模型与 IPC 边界

**Files:**
- Modify: `src/main/app-services.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload.ts`
- Test: `tests/ipc.test.ts`
- Test: `tests/app-services.test.ts` (create if absent)

**Interfaces:**
- Produces `SkinAutomationSettings = { persistenceEnabled: boolean; confirmBeforeRestart: boolean; temporarilyDisabled: boolean }`.
- Produces `getSkinAutomation(): Promise<SkinAutomationSettings>`.
- Produces `setSkinAutomation(patch: Partial<SkinAutomationSettings>): Promise<SkinAutomationSettings>`.
- IPC accepts only object fields whose values are booleans; unknown fields are rejected.

- [ ] **Step 1: Write failing settings tests**

```ts
it("defaults restart confirmation on and temporary disable off", async () => {
  await expect(services.getSkinAutomation()).resolves.toEqual({
    persistenceEnabled: true,
    confirmBeforeRestart: true,
    temporarilyDisabled: false
  });
});

it("rejects non-boolean skin automation values", async () => {
  await expect(invoke(IPC_CHANNELS.skinAutomationSet, { temporarilyDisabled: "true" }))
    .rejects.toThrow(/boolean/i);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/ipc.test.ts tests/app-services.test.ts`

Expected: FAIL because automation settings IPC does not exist.

- [ ] **Step 3: Implement minimum settings persistence**

```ts
interface AppSettings {
  doubaoExecutable?: string;
  port: number;
  skinPersistenceEnabled: boolean;
  confirmBeforeRestart: boolean;
  skinTemporarilyDisabled: boolean;
}
```

Merge stored JSON with defaults. Add `skin:automation:get` and `skin:automation:set`; expose typed preload methods. Setting `temporarilyDisabled=true` stops guardian immediately. Setting it `false` starts guardian only when persistence is enabled and active state exists.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- tests/ipc.test.ts tests/app-services.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/app-services.ts src/main/ipc-handlers.ts src/shared/ipc.ts src/preload.ts tests/ipc.test.ts tests/app-services.test.ts
git commit -m "feat: persist skin automation settings"
```

### Task 2: 可控关闭与皮肤模式重启

**Files:**
- Modify: `src/main/doubao-launcher.ts`
- Modify: `src/main/app-services.ts`
- Test: `tests/doubao-launcher.test.ts`
- Test: `tests/app-services.test.ts`

**Interfaces:**
- Produces `closeDoubaoForRestart(): Promise<boolean>`.
- Produces `restartDoubaoInSkinMode(port: number): Promise<DoubaoPortStatus | { kind: "error"; reason: string }>`.
- `closeDoubaoForRestart` invokes Windows `taskkill /PID <mainPid> /T /F` only for verified `Doubao.exe` process tree.

- [ ] **Step 1: Write failing close and restart tests**

```ts
it("ends verified Doubao process tree before restarting", async () => {
  const taskkill = vi.fn().mockResolvedValue({ stdout: "SUCCESS", stderr: "" });
  await expect(closeDoubaoForRestart({ findMainPid, taskkill })).resolves.toBe(true);
  expect(taskkill).toHaveBeenCalledWith("taskkill.exe", ["/PID", "321", "/T", "/F"], expect.anything());
});

it("does not start Doubao when process close fails", async () => {
  const result = await services.restartDoubaoInSkinMode(9225);
  expect(result).toEqual({ kind: "error", reason: "close-failed" });
  expect(launch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/doubao-launcher.test.ts tests/app-services.test.ts`

Expected: FAIL because controlled close API does not exist.

- [ ] **Step 3: Implement minimum close/restart path**

Find `Doubao.exe` main PID with `tasklist` or PowerShell process data; reject absent or non-Doubao executable identities. Run `taskkill.exe /PID <pid> /T /F` only after caller has selected confirmation or disabled confirmation. Await process exit before `launchDoubao(executable, port)`, then reuse `waitForPort`.

Return exact reasons: `doubao-not-found`, `close-failed`, `startup-timeout`, `port-conflict`.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- tests/doubao-launcher.test.ts tests/app-services.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/doubao-launcher.ts src/main/app-services.ts tests/doubao-launcher.test.ts tests/app-services.test.ts
git commit -m "feat: restart Doubao in skin mode"
```

### Task 3: 守护状态机与确认请求

**Files:**
- Modify: `src/main/skin-guardian.ts`
- Modify: `src/main/app-services.ts`
- Modify: `src/main/ipc-handlers.ts`
- Test: `tests/skin-guardian.test.ts`
- Test: `tests/app-services.test.ts`

**Interfaces:**
- `GuardianResult` adds `"confirmation-required" | "temporarily-disabled"`.
- Produces `restartSkinMode(port: number, approved: boolean): Promise<unknown>` IPC service.
- Guardian publishes one pending restart request per detected normal-Doubao process identity; it never repeats dialog requests during retry delay.

- [ ] **Step 1: Write failing guardian tests**

```ts
it("requests confirmation instead of closing normal Doubao by default", async () => {
  const guardian = guardianWith({ confirmBeforeRestart: true, probe: ["restart-required"] });
  await expect(guardian.runOnce()).resolves.toBe("confirmation-required");
  expect(restart).not.toHaveBeenCalled();
});

it("restarts normal Doubao when confirmation is disabled", async () => {
  const guardian = guardianWith({ confirmBeforeRestart: false, probe: ["restart-required"] });
  await expect(guardian.runOnce()).resolves.toBe("retry");
  expect(restart).toHaveBeenCalledWith(9225);
});

it("does nothing while skin is temporarily disabled", async () => {
  const guardian = guardianWith({ temporarilyDisabled: true });
  await expect(guardian.runOnce()).resolves.toBe("temporarily-disabled");
  expect(probe).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/skin-guardian.test.ts tests/app-services.test.ts`

Expected: FAIL because new guardian outcomes and settings checks do not exist.

- [ ] **Step 3: Implement state machine**

Before port probing, return `temporarily-disabled` when configured. For `restart-required`, branch by `confirmBeforeRestart`: return `confirmation-required` and retain one pending request, or call controlled restart then return `retry`. Clear pending request when CDP connects, user cancels, skin is disabled, or target process identity changes.

`restartSkinMode(port, approved)` must reject `approved=false` without closing; on `approved=true`, call controlled restart then trigger guardian retry.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- tests/skin-guardian.test.ts tests/app-services.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/skin-guardian.ts src/main/app-services.ts src/main/ipc-handlers.ts tests/skin-guardian.test.ts tests/app-services.test.ts
git commit -m "feat: control guardian restart prompts"
```

### Task 4: 主窗口设置和确认对话

**Files:**
- Modify: `src/renderer/app.ts`
- Modify: `src/renderer/styles.css`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload.ts`
- Test: `tests/renderer.test.ts`
- Test: `tests/ipc.test.ts`

**Interfaces:**
- Renderer consumes `getSkinAutomation`, `setSkinAutomation`, `restartSkinMode`.
- Produces controls `data-action="confirm-before-restart"` and `data-action="temporarily-disable-skin"`.

- [ ] **Step 1: Write failing renderer tests**

```ts
it("renders restart-confirmation and temporary-disable switches", async () => {
  await mountApp(root, fakeApi);
  expect(root.querySelector("[data-action='confirm-before-restart']")).not.toBeNull();
  expect(root.querySelector("[data-action='temporarily-disable-skin']")).not.toBeNull();
});

it("does not ask or start while temporary disable is enabled", async () => {
  await mountApp(root, fakeApi);
  root.querySelector<HTMLInputElement>("[data-action='temporarily-disable-skin']")!.click();
  root.querySelector<HTMLButtonElement>("[data-action='start']")!.click();
  expect(fakeApi.restartSkinMode).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/renderer.test.ts tests/ipc.test.ts`

Expected: FAIL because switches and API methods do not exist.

- [ ] **Step 3: Implement controls and dialog**

Render settings controls below current wallpaper controls. `暂时停用皮肤` displays `皮肤已暂时停用` and disables the start/apply actions that would trigger automatic behavior. When status is `confirmation-required`, show Electron warning dialog:

```text
豆包未以皮肤模式启动。关闭并重新启动豆包以恢复皮肤？
豆包中未发送的文字可能丢失。
```

Buttons are `取消` and `关闭并重启`. Invoke `restartSkinMode(port, true)` only for second button. First button invokes `restartSkinMode(port, false)` to clear pending request.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- tests/renderer.test.ts tests/ipc.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.ts src/renderer/styles.css src/shared/ipc.ts src/preload.ts tests/renderer.test.ts tests/ipc.test.ts
git commit -m "feat: add skin restart controls"
```

### Task 5: 回归、打包与人工验收

**Files:**
- Modify: `tests/release-win.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write failing release assertion**

```ts
expect(packageJson.version).toBe("0.1.12");
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/release-win.test.ts`

Expected: FAIL until version is updated.

- [ ] **Step 3: Bump and verify**

Set package and lockfile version to `0.1.12`.

Run: `npm.cmd test`

Expected: all unit tests pass.

Run: `npm.cmd run release:win`

Expected: typecheck, tests, portable app and Squirrel installer succeed.

- [ ] **Step 4: Manual acceptance**

1. Start ordinary Doubao. With confirmation on, verify prompt; cancel verifies no close; approve verifies close, 9225 launch and saved theme restoration.
2. Start ordinary Doubao with confirmation off. Verify automatic close, 9225 launch and restoration.
3. Enable temporary disable. Restart skin app and Windows; verify no prompt, close, launch or injection.
4. Disable temporary disable. Verify normal behavior returns according to confirmation setting.
5. Click restore official appearance. Verify guardian does not inject again.
6. Start Doubao already with 9225. Verify restore occurs without closing it.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/release-win.test.ts
git commit -m "chore: release 0.1.12"
```
