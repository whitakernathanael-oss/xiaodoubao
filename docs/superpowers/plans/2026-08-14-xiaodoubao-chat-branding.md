# 小豆包对话样式与品牌更新实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化注入豆包后的用户/助手消息形态，并把窗口、安装包、EXE、快捷方式和用户可见文案统一为“小豆包”与新图标。

**Architecture:** 保留现有适配器与 DOM 标记流程，只修改注入 CSS 和本地预览表现。品牌层仅修改 Electron/Forge 用户可见元数据、Squirrel 快捷方式迁移和图标资源，内部包名与更新标识保持不变。

**Tech Stack:** Electron 43、Electron Forge、Squirrel.Windows、TypeScript、Vitest、原生 CSS。

## Global Constraints

- “小豆包”和“豆包皮肤”均指本项目；“豆包”仅指官方客户端。
- 用户消息宽度为响应式范围，短消息不窄，长消息最大约占聊天区 72%。
- 豆包回复正文无背景、边框、圆角和阴影；图片、表格、引用、代码块不能被清除专用样式。
- 用户可见名称统一为“小豆包”；内部 `doubao-autoskin` 与 `doubao_autoskin` 保持不变。
- 图标源为 `D:\admin\新建文件夹\g3u7e-80e24\p3r68-cdx67\g3u7e-80e24-001.ico`。
- 不增加依赖，不修改主题 ZIP、适配器选择器、用户数据目录或皮肤持久化逻辑。
- 发布版本为 `0.1.20`。

---

### Task 1: 对话消息样式与预览一致性

**Files:**
- Modify: `src/main/injector.ts`
- Modify: `src/renderer/styles.css`
- Test: `tests/injector.test.ts`
- Test: `tests/preview.test.ts`

**Interfaces:**
- Consumes: 现有 `.dbs-message-user`、`.dbs-message-assistant` 标记和 `.preview__user`、`.preview__assistant` 结构。
- Produces: 用户消息响应式气泡规则；豆包回复无框规则；相同的本地预览效果。

- [ ] **Step 1: 写入失败的注入 CSS 测试**

在 `tests/injector.test.ts` 添加测试，应用主题后读取 `#doubao-autoskin-style`：

```ts
expect(css).toContain("html.doubao-skin .dbs-message-user");
expect(css).toContain("width: fit-content !important");
expect(css).toContain("min-width: min(280px, 72%) !important");
expect(css).toContain("max-width: min(72%, 760px) !important");
expect(css).toContain("overflow-wrap: anywhere !important");
expect(css).toMatch(/\.dbs-message-assistant \{[^}]*background: transparent !important/);
expect(css).toMatch(/\.dbs-message-assistant \{[^}]*border: 0 !important/);
expect(css).toMatch(/\.dbs-message-assistant \{[^}]*box-shadow: none !important/);
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm.cmd test -- tests/injector.test.ts`

Expected: FAIL，因为用户宽度约束不存在、助手仍使用气泡表面。

- [ ] **Step 3: 最小修改真实注入 CSS**

在 `src/main/injector.ts`：

- 用户消息保留现有颜色/边框/阴影，并增加：

```css
display: block !important;
width: fit-content !important;
min-width: min(280px, 72%) !important;
max-width: min(72%, 760px) !important;
overflow-wrap: anywhere !important;
```

- 助手消息改为：

```css
background: transparent !important;
border: 0 !important;
border-radius: 0 !important;
box-shadow: none !important;
padding-inline: 0 !important;
```

不要改适配器、文字颜色和代码块规则。

- [ ] **Step 4: 写入失败的预览契约测试**

在 `tests/preview.test.ts` 读取 `styles.css` 并断言：

```ts
expect(css).toMatch(/\.preview__user p\s*\{[^}]*min-width/);
expect(css).toMatch(/\.preview__user p\s*\{[^}]*max-width/);
expect(css).toMatch(/\.preview__assistant p\s*\{[^}]*background\s*:\s*transparent/);
expect(css).toMatch(/\.preview__assistant p\s*\{[^}]*border\s*:\s*0/);
```

- [ ] **Step 5: 运行预览测试确认 RED**

Run: `npm.cmd test -- tests/preview.test.ts`

Expected: FAIL，因为预览仍给双方共用气泡框。

- [ ] **Step 6: 最小修改预览 CSS**

在 `src/renderer/styles.css` 将消息框公共规则拆开：只有 `.preview__user p` 使用气泡背景/边框/圆角/阴影和响应式宽度；`.preview__assistant p` 使用透明背景、无边框、无阴影。保持 `preview.ts` DOM 不变。

- [ ] **Step 7: 验证并提交**

Run:

```powershell
npm.cmd test -- tests/injector.test.ts tests/preview.test.ts
npm.cmd run typecheck
git diff --check
```

Commit: `fix: restore native assistant messages`

---

### Task 2: 小豆包图标、窗口名称与快捷方式迁移

**Files:**
- Replace: `assets/icon.ico`
- Modify: `src/main.ts`
- Modify: `forge.config.ts`
- Modify: `package.json`
- Test: `tests/package-smoke.test.ts`

**Interfaces:**
- Consumes: Squirrel 安装事件、Forge `packagerConfig` 和现有 `assets/icon.ico` 路径。
- Produces: `小豆包.exe`、`小豆包-Setup.exe`、新图标、安装/升级/卸载的快捷方式迁移。

- [ ] **Step 1: 写入失败的品牌与快捷方式测试**

在 `tests/package-smoke.test.ts` 增加/修改断言：

```ts
expect(packageJson.productName).toBe("小豆包");
expect(packager.executableName).toBe("小豆包");
expect(packager.name).toBe("doubao-autoskin");
expect(mainSource).toContain('title: "小豆包"');
expect(mainSource).toContain('icon: path.join(app.getAppPath(), "assets", "icon.ico")');
expect(mainSource).toContain('"--removeShortcut", "豆包皮肤版.exe"');
expect(mainSource).toContain('"--createShortcut", executableName');
```

读取 `forge.config.ts` 或 makers，断言 setup 文件名为 `小豆包-Setup.exe`，Squirrel 内部 `name` 仍是 `doubao_autoskin`。读取 ICO 前四字节并断言 `[0, 0, 1, 0]`。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm.cmd test -- tests/package-smoke.test.ts`

Expected: FAIL，当前名称仍是“豆包皮肤版”、窗口未显式设置图标、没有旧快捷方式迁移。

- [ ] **Step 3: 替换图标资源**

将用户提供的 ICO 原样复制覆盖 `assets/icon.ico`。不得转码或降采样。

- [ ] **Step 4: 修改用户可见品牌**

- `package.json`: `productName` 改为 `小豆包`。
- `forge.config.ts`: `executableName` 改为 `小豆包`，`setupExe` 改为 `小豆包-Setup.exe`；保留 `name: "doubao-autoskin"` 和 maker `name: "doubao_autoskin"`。
- `src/main.ts`: 窗口标题、退出提示、启动失败提示改为“小豆包”，BrowserWindow 显式设置 ICO 路径。
- 编辑器品牌文案中用户可见的“豆包皮肤版”改为“小豆包”，若该文案位于 `src/renderer/app.ts`，先补 `tests/renderer.test.ts` RED 后授权此同一任务修改该文件。

- [ ] **Step 5: 实现快捷方式迁移**

保持 `handleSquirrelEvent()` 容错行为：

- install/updated：先以独立 Squirrel 命令尝试删除 `豆包皮肤版.exe` 快捷方式，再创建当前 `小豆包.exe` 快捷方式；两个操作均使用 `Update.exe`。
- uninstall：移除当前 `小豆包.exe` 与旧 `豆包皮肤版.exe` 快捷方式。
- 不因旧快捷方式不存在而阻止新快捷方式创建。

若现有单个 `args` 结构不便表达，改为 `commands: string[][]`，逐个 `spawn` 并 `unref()`，不新增抽象文件。

- [ ] **Step 6: 验证并提交**

Run:

```powershell
npm.cmd test -- tests/package-smoke.test.ts tests/renderer.test.ts
npm.cmd run typecheck
git diff --check
```

Commit: `feat: rename app to xiaodoubao`

---

### Task 3: 发布 0.1.20 与安装包验收

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/release-win.test.ts`
- Modify: `tools/release-win.cjs`

**Interfaces:**
- Consumes: Task 2 生成的 `小豆包` Forge 元数据。
- Produces: `0.1.20` 安装包与便携版路径契约。

- [ ] **Step 1: 写入失败的版本与路径测试**

更新 `tests/release-win.test.ts`：

```ts
expect(packageJson.version).toBe("0.1.20");
expect(packageLock.version).toBe("0.1.20");
expect(packageLock.packages[""].version).toBe("0.1.20");
expect(artifactPaths("C:\\project")).toEqual({
  setup: path.resolve("C:\\project", "out/make/squirrel.windows/x64/小豆包-Setup.exe"),
  portable: path.resolve("C:\\project", "out/doubao-autoskin-win32-x64/小豆包.exe")
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm.cmd test -- tests/release-win.test.ts`

Expected: FAIL，版本仍是 `0.1.19` 且发布工具仍查找旧文件名。

- [ ] **Step 3: 最小修改发布元数据与工具**

- `package.json`、`package-lock.json` 根版本与 `packages[""]` 更新为 `0.1.20`。
- `tools/release-win.cjs` 仅更新安装包和便携版文件名为 `小豆包-Setup.exe`、`小豆包.exe`。

- [ ] **Step 4: 完整验证与打包**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run make
git diff --check
```

Expected:

- 全量测试零失败；
- `out/make/squirrel.windows/x64/小豆包-Setup.exe` 存在；
- `out/doubao-autoskin-win32-x64/小豆包.exe` 存在；
- 旧名称不作为本次产物路径。

- [ ] **Step 5: 提交**

Commit: `chore: release xiaodoubao 0.1.20`

---

### Task 4: 全分支审查与合并验收

**Files:**
- Review: 从本计划分支起点到 HEAD 的全部差异。

- [ ] **Step 1: 审查规格覆盖**

确认真实注入/预览一致，用户消息宽度可响应，小豆包回复无框，内部标识未改，新旧快捷方式迁移存在，所有用户可见名称与产物路径为“小豆包”。

- [ ] **Step 2: 运行合并前验证**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run make
git diff --check
```

- [ ] **Step 3: 合并后在正式 master 重复验证**

快进合并后重复全量测试、类型检查和 Windows 打包。只有正式目录产物存在且测试通过后，才清理临时工作树。
