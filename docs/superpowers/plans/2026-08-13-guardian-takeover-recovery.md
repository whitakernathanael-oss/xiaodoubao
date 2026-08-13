# Guardian Takeover Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 普通豆包被自动关闭后，守护持续完成重启与皮肤注入；首次启动失败不得进入永久等待。

**Architecture:** `SkinGuardian` 持有只存在于当前进程的接管状态。接管状态下的 `stopped` 使用 `ActiveSkinState.doubaoExecutable` 主动恢复启动；非接管状态保持被动等待。所有启动/重启异常转换为可调度的 `retry`，成功应用后清除接管状态。

**Tech Stack:** TypeScript、Electron、Vitest、Windows process APIs

## Global Constraints

- 不新增设置、依赖、UI 或 public IPC。
- 只有已发生自动接管时，`stopped` 才允许主动启动豆包。
- 状态删除、stop 或暂时停用后不得启动/注入。
- 使用 `active-skin.json` 保存的准确 executable 与 port。
- 生产改动前必须有真实失败测试。

---

### Task 1: 接管状态与停止后恢复启动

**Files:**
- Modify: `src/main/skin-guardian.ts`
- Test: `tests/skin-guardian.test.ts`

**Interfaces:**
- Consumes: `ActiveSkinState.doubaoExecutable`、`probe()`、`restartRunningDoubao()`、`launch(executable, port)`
- Produces: 只在自动接管期间把 `stopped` 转为主动 `launch` + `retry`。

- [ ] **Step 1: 写失败测试**

增加测试：第一次 probe 为 `restart-required`，自动 restart 返回 false；第二次 probe 为 `stopped`。第二次 `runOnce()` 必须调用 `launch(state.doubaoExecutable, state.port)` 并返回 `retry`。另测普通 `stopped` 不 launch；stop 后不 launch。

- [ ] **Step 2: 运行 RED**

Run: `npm.cmd test -- tests/skin-guardian.test.ts`

Expected: 接管后的 `stopped` 仍返回 `waiting-for-doubao`，新测试失败。

- [ ] **Step 3: 最小实现**

在 guardian 内增加 `takeoverPending`。自动 restart-required 时置 true；pending + stopped 时从 state 调 `launch()`，返回 `retry`。无 state、`stop()`、成功 `applied/partial` 时清除。launch 抛错时返回 `retry`，不得让循环 rejection。

- [ ] **Step 4: 运行 GREEN**

Run: `npm.cmd test -- tests/skin-guardian.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/main/skin-guardian.ts tests/skin-guardian.test.ts
git commit -m "fix: recover interrupted Doubao takeover"
```

### Task 2: 运行时使用保存路径并记录恢复阶段

**Files:**
- Modify: `src/main/app-services.ts`
- Test: `tests/package-smoke.test.ts`
- Test: `tests/skin-guardian.test.ts` only if integration seam can remain focused

**Interfaces:**
- Consumes: guardian `loadState()` 与 `launch(executable, port)`
- Produces: 重启恢复优先使用 active state path；错误变成隐私安全日志状态。

- [ ] **Step 1: 写失败测试**

增加源级/运行时最小测试，证明 guardian launch dependency 接收 state 保存的路径，不重新猜 settings 路径；重启 helper 抛错不会让 guardian timer 停止。

- [ ] **Step 2: 运行 RED**

Run: `npm.cmd test -- tests/package-smoke.test.ts tests/skin-guardian.test.ts`

Expected: 缺少新接管恢复接线或异常重试断言，FAIL。

- [ ] **Step 3: 最小实现**

保持现有 public API。守护从 state 读取路径；restart/launch 失败记录 `stage: guardian-takeover`、错误类型与失败状态，不记录路径或用户数据。所有错误返回 retry。

- [ ] **Step 4: 运行 GREEN 与总验证**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
git diff --check
```

Expected: 全部退出码 0。

- [ ] **Step 5: 提交**

```powershell
git add src/main/app-services.ts tests/package-smoke.test.ts tests/skin-guardian.test.ts
git commit -m "fix: wire persisted takeover recovery"
```

### Task 3: 发布 0.1.17

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/release-win.test.ts`

**Interfaces:**
- Produces: Windows 修复版本 `0.1.17`。

- [ ] **Step 1: 版本测试改为 0.1.17 并运行 RED**

Run: `npm.cmd test -- tests/release-win.test.ts`

Expected: FAIL，实际为 `0.1.16`。

- [ ] **Step 2: 更新三处版本元数据**

更新 package、lock 根与 `packages[""]` 到 `0.1.17`，不改依赖与 license。

- [ ] **Step 3: 总验证与构建**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run make
git diff --check
```

Expected: 退出码 0；生成 `out/make/squirrel.windows/x64/豆包皮肤版-Setup.exe`。

- [ ] **Step 4: 提交**

```powershell
git add package.json package-lock.json tests/release-win.test.ts
git commit -m "chore: release 0.1.17"
```
