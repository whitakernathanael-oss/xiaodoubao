# 豆包皮肤持续恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户应用主题后，关闭皮肤工具、关闭豆包或重启 Windows，均自动恢复上次主题。

**Architecture:** 主进程把已启用主题保存到 `active-skin.json`。独立 `--skin-guardian` Electron 进程读取状态，启动带 CDP 参数的豆包、等待端口、通过现有 `SkinWorkflow` 注入，并在失联后退避重试。主窗口只增加“自动保持皮肤”开关；不创建托盘菜单。

**Tech Stack:** Electron Forge、TypeScript、Node `fs/promises`、现有 CDP、SkinWorkflow、Vitest。

## Global Constraints

- Windows only；CDP 仅限 `127.0.0.1`。
- 不修改豆包安装文件，不强制结束已运行且未开启 CDP 的豆包。
- 不新增依赖，不增加托盘菜单。
- 已启用主题、端口、豆包路径原子写入 `%LOCALAPPDATA%\\DoubaoSkin\\active-skin.json`。
- 用户点击“恢复官方外观”、关闭自动保持、删除当前主题时禁用守护。
- 守护连续失败按 1s、2s、4s、8s、16s、30s 退避；不得循环启动豆包。

---

### Task 1: 持久状态仓库

**Files:**
- Create: `src/main/skin-state.ts`
- Modify: `src/main/paths.ts`
- Test: `tests/skin-state.test.ts`

**Interfaces:**
- Produces `SkinStateStore` with `load(): Promise<ActiveSkinState | undefined>`, `save(state): Promise<void>`, `disable(): Promise<void>`.
- Produces `ActiveSkinState = { version: 1; enabled: boolean; themeId: string; port: number; doubaoExecutable: string; updatedAt: string }`.

- [ ] **Step 1: Write failing test**

```ts
it("writes and reads active theme atomically", async () => {
  const store = new SkinStateStore(file);
  await store.save({ version: 1, enabled: true, themeId: "wallpaper-002", port: 9225, doubaoExecutable: "C:/Doubao.exe", updatedAt: "2026-08-10T00:00:00.000Z" });
  await expect(store.load()).resolves.toMatchObject({ enabled: true, themeId: "wallpaper-002" });
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/skin-state.test.ts`

Expected: FAIL because `SkinStateStore` does not exist.

- [ ] **Step 3: Implement minimum**

Use `mkdir`, temporary file, `rename`; reject malformed JSON and invalid theme ID/port. Extend `resolveDataPaths()` with `activeSkin`.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- tests/skin-state.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/main/skin-state.ts src/main/paths.ts tests/skin-state.test.ts
git commit -m "feat: persist active skin state"
```

### Task 2: 守护循环

**Files:**
- Create: `src/main/skin-guardian.ts`
- Modify: `src/main/app-services.ts`
- Test: `tests/skin-guardian.test.ts`

**Interfaces:**
- Consumes `SkinStateStore`, `SkinWorkflow`, `probeDoubaoPort`, `launchDoubao`.
- Produces `SkinGuardian.start(): Promise<void>`, `stop(): void`, `runOnce(): Promise<GuardianResult>`.
- `GuardianResult` is `"applied" | "waiting-for-restart" | "retry" | "disabled"`.

- [ ] **Step 1: Write failing tests**

```ts
it("starts closed Doubao with saved CDP port then applies saved theme", async () => {
  const guardian = guardianWith({ probe: ["not-running", "connected"] });
  await expect(guardian.runOnce()).resolves.toBe("applied");
  expect(launch).toHaveBeenCalledWith("C:/Doubao.exe", 9225);
  expect(apply).toHaveBeenCalledWith("wallpaper-002", 9225);
});

it("does not close a running Doubao without CDP", async () => {
  const guardian = guardianWith({ probe: ["restart-required"] });
  await expect(guardian.runOnce()).resolves.toBe("waiting-for-restart");
  expect(launch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/skin-guardian.test.ts`

Expected: FAIL because `SkinGuardian` does not exist.

- [ ] **Step 3: Implement minimum**

```ts
async runOnce(): Promise<GuardianResult> {
  const state = await this.state.load();
  if (!state) return "disabled";
  const probe = await this.probe(state.port);
  if (probe.kind === "restart-required") return "waiting-for-restart";
  if (probe.kind !== "connected") { this.launch(state.doubaoExecutable, state.port); return "retry"; }
  return (await this.workflow.apply(state.themeId, state.port)).kind === "applied" ? "applied" : "retry";
}
```

Only one launch while waiting CDP. Use documented backoff sequence.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- tests/skin-guardian.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/main/skin-guardian.ts src/main/app-services.ts tests/skin-guardian.test.ts
git commit -m "feat: restore skin with background guardian"
```

### Task 3: 守护启动模式与登录启动

**Files:**
- Create: `src/main/startup-shortcut.ts`
- Modify: `src/main.ts`
- Test: `tests/startup-shortcut.test.ts`
- Test: `tests/package-smoke.test.ts`

**Interfaces:**
- Produces `installGuardianStartup(executable, startupFolder): Promise<void>` and `removeGuardianStartup(startupFolder): Promise<void>`.
- `src/main.ts` accepts `--skin-guardian`; this mode creates no BrowserWindow.

- [ ] **Step 1: Write failing tests**

```ts
it("writes current-user startup command for guardian mode", async () => {
  await installGuardianStartup("C:/App/豆包皮肤版.exe", startupFolder);
  await expect(readFile(commandFile, "utf8")).resolves.toContain("--skin-guardian");
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/startup-shortcut.test.ts tests/package-smoke.test.ts`

- [ ] **Step 3: Implement minimum**

Use current-user Startup `.cmd` file, not registry. Quote `process.execPath`; append `--skin-guardian`. Guardian mode initializes runtime and guardian only; never registers renderer IPC or creates a window.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- tests/startup-shortcut.test.ts tests/package-smoke.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/main/startup-shortcut.ts tests/startup-shortcut.test.ts tests/package-smoke.test.ts
git commit -m "feat: start skin guardian at login"
```

### Task 4: 主界面开关和应用语义

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/app-services.ts`
- Modify: `src/renderer/app.ts`
- Modify: `src/renderer/styles.css`
- Test: `tests/ipc.test.ts`
- Test: `tests/renderer.test.ts`

**Interfaces:**
- Produces `getSkinPersistence(): Promise<{ enabled: boolean }>` and `setSkinPersistence(enabled: boolean): Promise<{ enabled: boolean }>`.
- `applyTheme(id)` saves active state when persistence enabled.
- `restoreOfficial()` disables state and removes Startup command before clearing live injection.

- [ ] **Step 1: Write failing tests**

```ts
it("shows one automatic-keep-skin switch", async () => {
  await mountApp(root, fakeApi);
  expect(root.querySelector("[data-action='persistence']")).not.toBeNull();
});

it("passes only a boolean through persistence IPC", async () => {
  await expect(handler({}, true)).resolves.toEqual({ enabled: true });
  await expect(handler({}, "true")).rejects.toThrow(/boolean/i);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/ipc.test.ts tests/renderer.test.ts`

- [ ] **Step 3: Implement minimum**

Add one checkbox control in current settings area: `自动保持皮肤`. New theme apply defaults to enabled; disabling deletes active state and Startup command. Deleting active theme disables persistence. Restore disables persistence first, then removes live injection.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- tests/ipc.test.ts tests/renderer.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/preload.ts src/main/ipc-handlers.ts src/main/app-services.ts src/renderer/app.ts src/renderer/styles.css tests/ipc.test.ts tests/renderer.test.ts
git commit -m "feat: control automatic skin persistence"
```

### Task 5: 全量验证与交付

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/release-win.test.ts`

- [ ] **Step 1: Write failing release version test**

```ts
expect(packageJson.version).toBe("0.1.11");
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/release-win.test.ts`

- [ ] **Step 3: Bump version**

Set `package.json` and lockfile to `0.1.11`.

- [ ] **Step 4: Full verification**

Run: `npm.cmd run release:win`

Expected: typecheck, all tests, Squirrel installer, portable app pass.

- [ ] **Step 5: Manual acceptance**

1. Apply wallpaper theme; enable `自动保持皮肤`.
2. Close Skin; current Doubao remains skinned.
3. Exit Doubao; guardian starts it with port 9225 and restores same theme.
4. Restart Windows; Startup launches guardian and restores theme.
5. Click `恢复官方外观`; relaunch Doubao and verify official appearance remains.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/release-win.test.ts
git commit -m "chore: release 0.1.11"
```

