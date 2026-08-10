# 壁纸上传自动保存主题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 上传壁纸后立即生成、保存并选中自定义主题；相同规范化文件名覆盖已有用户主题。

**Architecture:** 保持 ThemeStore 与 IPC 合同不变。渲染进程在接收 `WallpaperSelection` 后选择已有同名用户主题或创建默认主题副本，应用现有派生调色板，然后使用既有 `saveTheme` 原子写入流程持久化。

**Tech Stack:** Electron、TypeScript、Vitest、happy-dom、既有 `ThemeStore`。

## Global Constraints

- 不自动把主题应用到豆包。
- 内置主题只读，绝不覆盖。
- 使用 `WallpaperSelection.name` 的完整规范化文件名做同名覆盖匹配。
- 新主题从 `DEFAULT_THEME` 生成；重复上传同名主题时保留已有主题的 ID、名称和壁纸布局参数。
- 不新增持久化格式、IPC 通道或依赖。

---

### Task 1: 覆盖主题身份与自动保存回归测试

**Files:**

- Modify: `tests/renderer.test.ts`
- Modify: `src/renderer/app.ts`

**Interfaces:**

- Consumes: `DoubaoSkinApi.chooseWallpaper(): Promise<WallpaperSelection | undefined>`、`saveTheme(input: SaveThemeInput): Promise<ThemeSummary>`。
- Produces: 通过界面壁纸选择器触发的自动保存行为。

- [ ] **Step 1: 写失败测试：首次上传立即创建并保存主题**

在 `tests/renderer.test.ts` 增加测试，使 `chooseWallpaper` 返回 `photo.png`，点击 `.wallpaper-picker` 后等待异步任务完成，断言：

```ts
expect(fake.saveTheme).toHaveBeenCalledOnce();
expect(fake.saveTheme).toHaveBeenCalledWith(expect.objectContaining({
  wallpaper: expect.objectContaining({ name: "photo.png" }),
  theme: expect.objectContaining({
    id: "wallpaper-photo",
    name: "photo",
    wallpaper: expect.objectContaining({ file: "photo.png" })
  })
}));
expect(fake.applyTheme).not.toHaveBeenCalled();
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: FAIL，因为当前代码只生成未保存的预览，`saveTheme` 尚未被调用。

- [ ] **Step 3: 实现最小自动保存流程**

在 `src/renderer/app.ts` 中：

```ts
const saved = await api.saveTheme({ theme: state.theme, wallpaper: pendingWallpaper });
summaries = await api.listThemes();
selectedSummary = summaries.find((item) => item.id === saved.id) ?? saved;
state = createEditorState(state.theme);
pendingWallpaper = undefined;
setStatus({ kind: "applied", message: `已自动保存：${saved.name}` });
```

调用此流程前，以 `structuredClone(DEFAULT_THEME)` 创建新主题，设置 `id`、`name` 和 `wallpaper.file`，并对它调用 `applyDerivedPalette`。自动保存路径不得调用 `ensureEditable()`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: PASS，首次上传自动保存，且没有调用 `applyTheme`。

- [ ] **Step 5: 提交**

```bash
git add tests/renderer.test.ts src/renderer/app.ts
git commit -m "feat: autosave themes from wallpapers"
```

### Task 2: 同名覆盖与稳定主题 ID

**Files:**

- Modify: `tests/renderer.test.ts`
- Modify: `src/renderer/app.ts`

**Interfaces:**

- Consumes: `ThemeSummary.wallpaperFile`、`ThemeSummary.readOnly`、`api.loadTheme(id)`。
- Produces: `wallpaperThemeId(name, summaries): string` 与同名用户主题覆盖行为。

- [ ] **Step 1: 写失败测试：同名图片复用已有用户主题**

让 `listThemes` 返回 `id: "wallpaper-photo"`、`readOnly: false`、`wallpaperFile: "photo.png"` 的主题摘要；选择 `photo.png` 后断言：

```ts
expect(fake.loadTheme).toHaveBeenCalledWith("wallpaper-photo");
expect(fake.saveTheme).toHaveBeenCalledWith(expect.objectContaining({
  theme: expect.objectContaining({ id: "wallpaper-photo" })
}));
expect(root.querySelectorAll(".theme-card")).toHaveLength(2);
```

并增加 ID 冲突测试：当 `wallpaper-photo` 被另一个不同 `wallpaperFile` 的用户主题占用时，新主题 ID 应为 `wallpaper-photo-2`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: FAIL，因为当前选择流程总是从当前主题继续编辑，且没有同名查找或稳定 ID。

- [ ] **Step 3: 实现同名主题准备函数**

在 `src/renderer/app.ts` 增加局部辅助函数：

```ts
function wallpaperStem(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || name;
}

function wallpaperThemeId(name: string, items: readonly ThemeSummary[]): string {
  const slug = wallpaperStem(name).toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "theme";
  const base = `wallpaper-${slug}`;
  let id = base;
  for (let suffix = 2; items.some((item) => item.id === id); suffix += 1) id = `${base}-${suffix}`;
  return id;
}
```

选择图片时先查找 `!item.readOnly && item.wallpaperFile === selection.name`。匹配时加载该主题；未匹配时以 `DEFAULT_THEME` 克隆为基底，分配 `wallpaperThemeId` 和 `wallpaperStem` 名称。两条路径都用新壁纸文件与 `applyDerivedPalette` 更新后自动保存。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: PASS，同名用户主题被覆盖，内置主题不参与匹配，ID 冲突会追加数字后缀。

- [ ] **Step 5: 提交**

```bash
git add tests/renderer.test.ts src/renderer/app.ts
git commit -m "feat: replace matching wallpaper themes"
```

### Task 3: 保存失败时可恢复与完整验证

**Files:**

- Modify: `tests/renderer.test.ts`
- Modify: `src/renderer/app.ts`

**Interfaces:**

- Consumes: 既有保存按钮 `[data-action='save']` 与 `saveDraft()`。
- Produces: 自动保存失败后保留待保存壁纸与预览，手动保存可重试。

- [ ] **Step 1: 写失败测试：自动保存失败后手动保存能够重试**

让 `fake.saveTheme` 第一次 reject、第二次 resolve。选择 `photo.png`，等待自动保存失败后点击 `[data-action='save']`，断言：

```ts
expect(fake.saveTheme).toHaveBeenCalledTimes(2);
expect(root.querySelector(".preview__wallpaper")).not.toBeNull();
expect(root.querySelector("[data-role='status']")?.textContent).toContain("保存");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: FAIL，因为当前壁纸选择事件没有将自动保存错误转换为状态，也没有专门保留失败后的重试状态。

- [ ] **Step 3: 实现错误边界**

将壁纸选择器监听器改为：

```ts
choose.addEventListener("click", () => {
  void chooseWallpaper().catch((error) => setStatus({ kind: "error", error }));
});
```

在自动保存前已设置 `pendingWallpaper` 和 `wallpaperUrl`，因此失败时不清除两者；只在 `saveDraft` 成功后清除。不要在失败分支调用 `loadTheme` 或重新渲染为空预览。

- [ ] **Step 4: 运行完整验证**

Run:

```bash
npm.cmd test
npm.cmd run typecheck
```

Expected: 全部测试通过，TypeScript 无错误。

- [ ] **Step 5: 提交**

```bash
git add tests/renderer.test.ts src/renderer/app.ts
git commit -m "fix: retain wallpaper draft after autosave failure"
```
