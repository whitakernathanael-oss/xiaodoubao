# 小豆包顶栏、消息气泡与快捷方式修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除编辑器品牌块，修复豆包用户消息双层窄框，并把 Windows 快捷方式稳定命名为“小豆包”。

**Architecture:** 保留现有主题注入与 Squirrel 内部标识；消息气泡样式从内部文字节点移动到官方发送消息容器。快捷方式通过安装/升级后的 best-effort 文件迁移解决，不更改包身份。

**Tech Stack:** Electron 43、Electron Forge/Squirrel.Windows、TypeScript、Vitest、原生 CSS。

## Global Constraints

- 用户消息只有一层气泡，最小宽度 `min(360px, 72%)`，最大宽度 `min(72%, 760px)`。
- 豆包回复继续无框。
- 编辑器左上角图标和全部“小豆包”文字整块删除。
- 用户可见快捷方式名称为“小豆包”，内部 `doubao-autoskin` 与 `doubao_autoskin` 不变。
- 不增加依赖，不修改持久化、启动守护、主题 ZIP 或其他适配器区域。
- 发布版本为 `0.1.21`。

---

### Task 1: 顶栏与消息气泡

**Files:**
- Modify: `assets/adapters/doubao-adapter.json`
- Modify: `src/main/injector.ts`
- Modify: `src/renderer/app.ts`
- Modify: `src/renderer/styles.css`
- Test: `tests/injector.test.ts`
- Test: `tests/renderer.test.ts`
- Test: `tests/preview.test.ts`

**Interfaces:**
- Consumes: adapter `messageUser`/`messageAssistant` regions and existing `mark()` flow.
- Produces: outer send-message container marked `.dbs-message-user`; header without `.wordmark`.

- [ ] Add RED tests asserting `messageUser` targets `[data-testid="send_message"]`, inner text node does not receive the class, CSS uses 360px min width, assistant remains no-frame, and renderer has no `.wordmark`.
- [ ] Run focused tests and confirm expected failures.
- [ ] Change only the adapter selector, injected CSS, matching preview CSS, and renderer header markup.
- [ ] Run focused tests, typecheck, detector once, diff-check; commit `fix: simplify header and user bubbles`.

### Task 2: 快捷方式名称迁移

**Files:**
- Create: `src/main/shortcut-migration.ts`
- Modify: `src/main.ts`
- Test: `tests/shortcut-migration.test.ts`
- Test: `tests/package-smoke.test.ts`

**Interfaces:**
- Produces: `renameVisibleShortcuts(paths, move)` or equivalent small helper that renames old `.lnk` names to `小豆包.lnk` without changing target/icon.

- [ ] Add RED unit tests covering Start Menu/Desktop, `doubao-autoskin.lnk`, `豆包皮肤版.lnk`, existing destination, and best-effort missing files.
- [ ] Implement a minimal filesystem helper using Node stdlib only.
- [ ] Call it after install/update Squirrel commands have had time to create the link; retain internal identifiers.
- [ ] Run focused tests/typecheck/diff-check; commit `fix: migrate xiaodoubao shortcuts`.

### Task 3: 发布 0.1.21

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/release-win.test.ts`

- [ ] Add RED version assertions for `0.1.21`.
- [ ] Update package and lock versions only.
- [ ] Run full tests, typecheck, Windows make and verify `小豆包-Setup.exe`/`小豆包.exe`.
- [ ] Commit `chore: release xiaodoubao 0.1.21`.

### Task 4: Final review and merge

- [ ] Review the complete branch against the design.
- [ ] Run full tests/typecheck/make/diff-check.
- [ ] Fast-forward merge to local master, repeat verification, then clean only this plan's worktree.
