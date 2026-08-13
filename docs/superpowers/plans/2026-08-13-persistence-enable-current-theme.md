# 自动保持当前主题实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开启“自动保持皮肤”时保存并应用当前主题、建立恢复状态并启动守护；恢复官方外观后同步取消复选框。

**Architecture:** 保持现有 IPC，不新增设置。渲染层负责把“开启自动保持”编排为保存草稿、启用持久化、应用当前主题；主进程继续只在应用成功或部分成功后写入 `active-skin.json` 并启动守护。恢复官方外观成功后，渲染层重新读取真实持久化设置并同步复选框。

**Tech Stack:** TypeScript、Electron、Vitest、happy-dom

## Global Constraints

- 不新增设置项或依赖。
- 不猜测已删除的旧主题。
- 不改变“暂时停用皮肤”和“关闭豆包前询问我”语义。
- 失败时不得显示自动保持已成功。
- 所有生产改动必须先有失败测试。

---

### Task 1: 编排自动保持当前主题

**Files:**
- Modify: `src/renderer/app.ts:279-287`
- Test: `tests/renderer.test.ts`

**Interfaces:**
- Consumes: `saveDraft(): Promise<ThemeSummary>`、`api.setSkinPersistence(enabled: boolean)`、`api.applyTheme(id: string)`
- Produces: 持久化开关开启时保存并应用当前主题；关闭时沿用 `setSkinPersistence(false)`。

- [ ] **Step 1: 写失败测试**

在 `tests/renderer.test.ts` 增加测试：挂载后将持久化复选框从未选中切为选中，断言先调用 `setSkinPersistence(true)`，再用当前主题 ID 调用 `applyTheme(DEFAULT_THEME.id)`；只有 `applyTheme` 返回 `applied` 或 `partial` 时显示“自动保持皮肤已开启”。再增加 `applyTheme` 返回 `error` 时不得显示成功文案的测试。

- [ ] **Step 2: 运行 RED**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: FAIL，因为当前 change handler 只调用 `setSkinPersistence()`，不调用 `applyTheme()`。

- [ ] **Step 3: 最小实现**

将持久化 change handler 改为异步编排：

```ts
if (!persistence.checked) {
  const result = await api.setSkinPersistence(false);
  persistence.checked = result.enabled;
  setStatus({ kind: "applied", message: "关闭后不自动恢复" });
  return;
}
const saved = await saveDraft();
const enabled = await api.setSkinPersistence(true);
persistence.checked = enabled.enabled;
const applied = await api.applyTheme(saved.id);
setStatus(applied);
```

若保存、设置或应用抛错，保留现有 catch；不得写成功文案。主进程 `applyTheme()` 负责成功后写入状态和启动守护。

- [ ] **Step 4: 运行 GREEN**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/app.ts tests/renderer.test.ts
git commit -m "fix: persist current theme when enabled"
```

### Task 2: 恢复官方外观后同步真实开关

**Files:**
- Modify: `src/renderer/app.ts:283`
- Test: `tests/renderer.test.ts`

**Interfaces:**
- Consumes: `api.restoreOfficial()`、`api.getSkinPersistence()`
- Produces: 恢复成功后 `persistence.checked` 与主进程一致。

- [ ] **Step 1: 写失败测试**

增加测试：初始 `getSkinPersistence()` 返回 `{ enabled: true }`；点击“恢复官方外观”；等待异步完成；断言 `restoreOfficial()` 被调用，持久化复选框变为未勾选。

- [ ] **Step 2: 运行 RED**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: FAIL，因为当前 handler 只更新状态文本。

- [ ] **Step 3: 最小实现**

恢复成功后重新读取真实设置：

```ts
await api.restoreOfficial();
persistence.checked = (await api.getSkinPersistence()).enabled;
setStatus({ kind: "not-running" });
```

恢复失败时沿用错误处理，不提前取消勾选。

- [ ] **Step 4: 运行 GREEN**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/app.ts tests/renderer.test.ts
git commit -m "fix: sync persistence after restore"
```

### Task 3: 发布与总验证

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/release-win.test.ts`

**Interfaces:**
- Produces: Windows 修复版本 `0.1.16`。

- [ ] **Step 1: 版本测试先改为 0.1.16**

更新 `tests/release-win.test.ts` 中 package 与 lockfile 三处版本断言为 `0.1.16`。

- [ ] **Step 2: 运行 RED**

Run: `npm.cmd test -- tests/release-win.test.ts`

Expected: FAIL，实际版本为 `0.1.15`。

- [ ] **Step 3: 更新版本元数据**

更新 `package.json`、`package-lock.json` 根版本及 `packages[""]` 版本为 `0.1.16`。不得修改依赖或 license。

- [ ] **Step 4: 总验证**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run make
git diff --check
```

Expected: 全部退出码 0；安装包生成于 `out/make/squirrel.windows/x64/豆包皮肤版-Setup.exe`。

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json tests/release-win.test.ts
git commit -m "chore: release 0.1.16"
```
