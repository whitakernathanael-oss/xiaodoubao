# 暂时停用皮肤联动后台运行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“暂时停用皮肤”同时停止后台检测、移除开机启动并允许设置窗口彻底退出；重新启用且已有活动主题时恢复后台守护与开机启动。

**Architecture:** 保留现有 IPC、启动文件夹脚本和 `SkinGuardian`。新增一个无 Electron 依赖的小型 `skin-background` 协调器，集中决定后台驻留条件和启动项/守护的切换顺序；`app-services.ts` 只负责读取真实活动皮肤状态并注入现有操作。Renderer 仅更新说明文案。

**Tech Stack:** Electron Forge、TypeScript、Vitest、现有 Windows Startup `.cmd` 与 `SkinGuardian`。

## Global Constraints

- 暂时停用时不探测、不弹窗、不关闭豆包、不启动豆包、不注入。
- 暂时停用不删除主题、壁纸或 `SkinStateStore`，也不恢复官方外观。
- 当前豆包已经显示的皮肤保持不变，直到页面自行刷新或豆包重启。
- 重新启用时只有存在活动皮肤状态才恢复后台守护和开机启动。
- 重新启用不得主动启动豆包；守护继续遵循 `stopped` 只等待的规则。
- 不新增独立开机启动开关、系统托盘、Windows 服务、计划任务、注册表项或依赖。
- 继续复用 `DoubaoSkinGuardian.cmd` 和 `--skin-guardian`。
- 保留正式目录现有未提交的 `package-lock.json` `license: MIT` 字段。
- 最终合并回本地 `master`，发布版本为 `0.1.14`。

---

### Task 1: 建立可测试的后台协调器

**Files:**
- Create: `src/main/skin-background.ts`
- Create: `tests/skin-background.test.ts`

**Interfaces:**
- Produces:
  - `shouldKeepSkinBackground(persistenceEnabled: boolean, activeSkinExists: boolean, temporarilyDisabled: boolean): boolean`
  - `reconcileSkinBackground(input: SkinBackgroundInput, dependencies: SkinBackgroundDependencies): Promise<void>`
- `SkinBackgroundInput` 包含 `temporarilyDisabled`、`shouldRun`、`manageStartup`。
- `SkinBackgroundDependencies` 注入 `stopGuardian`、`startGuardian`、`installStartup`、`removeStartup`。

- [ ] **Step 1: Write the failing predicate and transition tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { reconcileSkinBackground, shouldKeepSkinBackground } from "../src/main/skin-background";

function dependencies() {
  return {
    stopGuardian: vi.fn(),
    startGuardian: vi.fn(async () => undefined),
    installStartup: vi.fn(async () => undefined),
    removeStartup: vi.fn(async () => undefined)
  };
}

it("keeps background only for an enabled active skin", () => {
  expect(shouldKeepSkinBackground(true, true, false)).toBe(true);
  expect(shouldKeepSkinBackground(true, true, true)).toBe(false);
  expect(shouldKeepSkinBackground(true, false, false)).toBe(false);
  expect(shouldKeepSkinBackground(false, true, false)).toBe(false);
});

it("stops guardian and removes startup when temporarily disabled", async () => {
  const deps = dependencies();
  await reconcileSkinBackground(
    { temporarilyDisabled: true, shouldRun: false, manageStartup: true }, deps
  );
  expect(deps.stopGuardian).toHaveBeenCalledOnce();
  expect(deps.removeStartup).toHaveBeenCalledOnce();
  expect(deps.startGuardian).not.toHaveBeenCalled();
  expect(deps.installStartup).not.toHaveBeenCalled();
});

it("keeps no-state mode out of the background", async () => {
  const deps = dependencies();
  await reconcileSkinBackground(
    { temporarilyDisabled: false, shouldRun: false, manageStartup: true }, deps
  );
  expect(deps.stopGuardian).toHaveBeenCalledOnce();
  expect(deps.removeStartup).toHaveBeenCalledOnce();
  expect(deps.startGuardian).not.toHaveBeenCalled();
});

it("restores startup and guardian for an active skin", async () => {
  const deps = dependencies();
  await reconcileSkinBackground(
    { temporarilyDisabled: false, shouldRun: true, manageStartup: true }, deps
  );
  expect(deps.installStartup).toHaveBeenCalledOnce();
  expect(deps.startGuardian).toHaveBeenCalledOnce();
});

it("starts the current guardian even when startup installation fails", async () => {
  const deps = dependencies();
  deps.installStartup.mockRejectedValueOnce(new Error("startup failed"));
  await expect(reconcileSkinBackground(
    { temporarilyDisabled: false, shouldRun: true, manageStartup: true }, deps
  )).rejects.toThrow("startup failed");
  expect(deps.startGuardian).toHaveBeenCalledOnce();
});

it("never touches Windows startup outside packaged Windows mode", async () => {
  const deps = dependencies();
  await reconcileSkinBackground(
    { temporarilyDisabled: true, shouldRun: false, manageStartup: false }, deps
  );
  expect(deps.removeStartup).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm.cmd test -- tests/skin-background.test.ts`

Expected: FAIL because `src/main/skin-background.ts` does not exist.

- [ ] **Step 3: Implement the minimum coordinator**

```ts
export interface SkinBackgroundInput {
  temporarilyDisabled: boolean;
  shouldRun: boolean;
  manageStartup: boolean;
}

export interface SkinBackgroundDependencies {
  stopGuardian(): void;
  startGuardian(): Promise<void>;
  installStartup(): Promise<void>;
  removeStartup(): Promise<void>;
}

export function shouldKeepSkinBackground(
  persistenceEnabled: boolean,
  activeSkinExists: boolean,
  temporarilyDisabled: boolean
): boolean {
  return persistenceEnabled && activeSkinExists && !temporarilyDisabled;
}

export async function reconcileSkinBackground(
  input: SkinBackgroundInput,
  dependencies: SkinBackgroundDependencies
): Promise<void> {
  if (input.temporarilyDisabled || !input.shouldRun) {
    dependencies.stopGuardian();
    if (input.manageStartup) await dependencies.removeStartup();
    return;
  }

  let startupError: unknown;
  if (input.manageStartup) {
    try { await dependencies.installStartup(); }
    catch (error) { startupError = error; }
  }
  await dependencies.startGuardian();
  if (startupError) throw startupError;
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm.cmd test -- tests/skin-background.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/main/skin-background.ts tests/skin-background.test.ts
git commit -m "feat: coordinate skin background lifecycle"
```

---

### Task 2: 接入活动主题、开机启动与窗口驻留

**Files:**
- Modify: `src/main/app-services.ts`
- Modify: `tests/package-smoke.test.ts`
- Test: `tests/skin-background.test.ts`

**Interfaces:**
- Consumes `reconcileSkinBackground()` 与 `shouldKeepSkinBackground()` from Task 1。
- 保持 `ApplicationRuntime.persistenceEnabled(): boolean` 公共签名不变。
- 保持 IPC 的 `setSkinAutomation()` 输入输出不变。

- [ ] **Step 1: Write failing wiring assertions**

在 `tests/package-smoke.test.ts` 的持久化测试中加入精确源代码约束，防止重新退化为仅检查两个旧布尔值：

```ts
expect(source).toContain("shouldKeepSkinBackground(");
expect(source).toContain("await skinState.load()");
expect(source).toContain("reconcileSkinBackground(");
expect(source).not.toContain(
  "persistenceEnabled: () => settings.skinPersistenceEnabled && persistenceActive"
);
```

该 smoke test 只锁定 wiring；真实状态转换由 `tests/skin-background.test.ts` 行为测试负责。

- [ ] **Step 2: Run tests to verify RED**

Run: `npm.cmd test -- tests/package-smoke.test.ts tests/skin-background.test.ts`

Expected: FAIL because `app-services.ts` 尚未调用后台协调器，且仍使用旧驻留条件。

- [ ] **Step 3: Wire existing operations into the coordinator**

在 `app-services.ts` 导入：

```ts
import { reconcileSkinBackground, shouldKeepSkinBackground } from "./skin-background";
```

在 `guardian` 创建后增加局部工厂，复用现有启动脚本函数，不创建第二套启动机制：

```ts
const manageStartup = app.isPackaged && process.platform === "win32";
const backgroundDependencies = (startGuardian: () => Promise<void>) => ({
  stopGuardian: () => guardian.stop(),
  startGuardian,
  installStartup: () => installGuardianStartup(process.execPath, windowsStartupFolder()),
  removeStartup: () => removeGuardianStartup(windowsStartupFolder())
});
```

修改 `setSkinAutomation`：设置必须先保存；重新启用时重新读取活动皮肤，而不是只信任启动时缓存。

```ts
setSkinAutomation: async (patch) => {
  settings = { ...settings, ...patch };
  await settingsStore.save(settings);

  if (!settings.skinTemporarilyDisabled) {
    persistenceActive = settings.skinPersistenceEnabled && Boolean(await skinState.load());
  }

  await reconcileSkinBackground({
    temporarilyDisabled: settings.skinTemporarilyDisabled,
    shouldRun: settings.skinPersistenceEnabled && persistenceActive,
    manageStartup
  }, backgroundDependencies(() => guardian.start()));

  return {
    confirmBeforeRestart: settings.confirmBeforeRestart,
    temporarilyDisabled: settings.skinTemporarilyDisabled
  };
},
```

停用分支不得调用 `skinState.disable()` 或 `workflow.restore()`。

将成功应用主题后的直接安装/启动改为同一协调器，但保持 `startAlreadyApplied()`：

```ts
await reconcileSkinBackground({
  temporarilyDisabled: false,
  shouldRun: true,
  manageStartup
}, backgroundDependencies(() => guardian.startAlreadyApplied()));
```

将窗口后台驻留谓词改为：

```ts
persistenceEnabled: () => shouldKeepSkinBackground(
  settings.skinPersistenceEnabled,
  persistenceActive,
  settings.skinTemporarilyDisabled
),
```

`main.ts` 无需修改；它的 `close` 与 `window-all-closed` 已共同使用此谓词。

- [ ] **Step 4: Run targeted tests and typecheck**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd test -- tests/package-smoke.test.ts tests/skin-background.test.ts tests/startup-shortcut.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/main/app-services.ts tests/package-smoke.test.ts
git commit -m "feat: link temporary disable to background startup"
```

---

### Task 3: 更新开关说明文案

**Files:**
- Modify: `src/renderer/app.ts`
- Modify: `tests/renderer.test.ts`

**Interfaces:**
- 不改变 checkbox selector、IPC payload 或事件处理。
- 只更新用户可见说明文案。

- [ ] **Step 1: Write the failing copy test**

在 `tests/renderer.test.ts` 增加：

```ts
it("explains that temporary disable stops background and startup", async () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  await mountApp(root, api());
  expect(root.textContent).toContain("暂停后台检测与开机启动");
  expect(root.textContent).toContain("不会立即移除当前豆包皮肤");
  expect(root.textContent).toContain("有已保存主题时恢复后台运行");
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: FAIL because the current explanation does not mention background and startup behavior.

- [ ] **Step 3: Replace the explanatory copy**

在现有 `temporarily-disable-skin` checkbox 下显示：

```html
<small>暂停后台检测与开机启动，不删除已保存主题，也不会立即移除当前豆包皮肤。重新启用后，有已保存主题时恢复后台运行。</small>
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/app.ts tests/renderer.test.ts
git commit -m "feat: explain temporary disable behavior"
```

---

### Task 4: 发布 0.1.14 并回归验证

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/release-win.test.ts`

**Interfaces:**
- 根包、lockfile 根版本、`packages[""]` 版本统一为 `0.1.14`。
- 保留 `package-lock.json` 现有 `license: "MIT"`。

- [ ] **Step 1: Update the release test first**

将 `tests/release-win.test.ts` 中版本断言统一为：

```ts
expect(packageJson.version).toBe("0.1.14");
expect(packageLock.version).toBe("0.1.14");
expect(packageLock.packages[""].version).toBe("0.1.14");
```

- [ ] **Step 2: Run release test to verify RED**

Run: `npm.cmd test -- tests/release-win.test.ts`

Expected: FAIL with current version `0.1.13`.

- [ ] **Step 3: Update package metadata**

更新 `package.json` 和 `package-lock.json` 的三个版本位置为 `0.1.14`。不得删除：

```json
"license": "MIT"
```

- [ ] **Step 4: Run full verification**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd test`

Expected: all tests pass.

Run: `npm.cmd run release:win`

Expected output includes:

```text
豆包皮肤版 v0.1.14
Setup: ...\out\make\squirrel.windows\x64\豆包皮肤版-Setup.exe
Portable: ...\out\doubao-autoskin-win32-x64\豆包皮肤版.exe
```

- [ ] **Step 5: Manual acceptance**

1. 已有活动主题时勾选暂时停用：设置窗口保持打开，当前豆包皮肤不刷新。
2. 关闭设置窗口：豆包皮肤版进程完全退出。
3. 确认 Startup 文件夹不存在 `DoubaoSkinGuardian.cmd`；重启 Windows 后皮肤版不自动运行。
4. 手动打开皮肤版并取消停用：不主动启动豆包；重新创建启动命令并开始后台检测。
5. 没有活动主题时取消停用：关闭设置窗口后完全退出，不创建启动命令。
6. 首次成功应用主题后：关闭设置窗口隐藏到后台，安装启动命令。
7. “关闭豆包前询问我”开启/关闭的现有接管语义保持不变。

- [ ] **Step 6: Commit and merge locally**

```powershell
git add package.json package-lock.json tests/release-win.test.ts
git commit -m "chore: release 0.1.14"
```

通过最终只读审查后，将功能分支快进合并回本地 `master`，从正式项目目录重新运行 `npm.cmd run release:win`，再清理隔离 worktree 和功能分支。
