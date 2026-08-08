import "./styles.css";
import { extractPalette } from "./palette";
import { createEditorState, resetRegion, undo, updateField, type EditableRegion, type EditorState } from "./editor-state";
import { renderPreview, type PreviewPage } from "./preview";
import type { Theme, ThemeSummary } from "../shared/contracts";
import type { DoubaoSkinApi, WallpaperSelection } from "../shared/ipc";

type Control = {
  label: string;
  path: string[];
  kind: "color" | "range";
  min?: number;
  max?: number;
  step?: number;
};

const REGIONS: Array<{ id: EditableRegion; label: string }> = [
  { id: "wallpaper", label: "壁纸" }, { id: "sidebar", label: "侧栏" },
  { id: "chat", label: "聊天区" }, { id: "composer", label: "输入框" },
  { id: "buttons", label: "按钮/卡片" }, { id: "settings", label: "设置面板" }
];

const CONTROLS: Record<EditableRegion, Control[]> = {
  wallpaper: [
    { label: "水平位置", path: ["wallpaper", "positionX"], kind: "range", min: 0, max: 100, step: 1 },
    { label: "垂直位置", path: ["wallpaper", "positionY"], kind: "range", min: 0, max: 100, step: 1 },
    { label: "缩放", path: ["wallpaper", "scale"], kind: "range", min: 25, max: 300, step: 1 },
    { label: "模糊", path: ["wallpaper", "blur"], kind: "range", min: 0, max: 40, step: 1 },
    { label: "亮度", path: ["wallpaper", "brightness"], kind: "range", min: 0, max: 200, step: 1 },
    { label: "遮罩色", path: ["wallpaper", "overlayColor"], kind: "color" },
    { label: "遮罩透明度", path: ["wallpaper", "overlayOpacity"], kind: "range", min: 0, max: 1, step: 0.01 }
  ],
  sidebar: [
    { label: "背景", path: ["regions", "sidebar", "backgroundColor"], kind: "color" },
    { label: "透明度", path: ["regions", "sidebar", "opacity"], kind: "range", min: 0, max: 1, step: 0.01 },
    { label: "文字色", path: ["regions", "sidebar", "textColor"], kind: "color" },
    { label: "选中项", path: ["regions", "sidebar", "selectedColor"], kind: "color" },
    { label: "边框", path: ["regions", "sidebar", "borderColor"], kind: "color" },
    { label: "圆角", path: ["regions", "sidebar", "borderRadius"], kind: "range", min: 0, max: 64, step: 1 }
  ],
  chat: [
    { label: "背景", path: ["regions", "chat", "backgroundColor"], kind: "color" },
    { label: "透明度", path: ["regions", "chat", "opacity"], kind: "range", min: 0, max: 1, step: 0.01 },
    { label: "用户气泡", path: ["regions", "chat", "userBubbleColor"], kind: "color" },
    { label: "豆包气泡", path: ["regions", "chat", "assistantBubbleColor"], kind: "color" },
    { label: "文字色", path: ["regions", "chat", "textColor"], kind: "color" },
    { label: "边框", path: ["regions", "chat", "borderColor"], kind: "color" },
    { label: "圆角", path: ["regions", "chat", "borderRadius"], kind: "range", min: 0, max: 64, step: 1 },
    { label: "阴影", path: ["regions", "chat", "shadowStrength"], kind: "range", min: 0, max: 1, step: 0.01 }
  ],
  composer: [
    { label: "背景", path: ["regions", "composer", "backgroundColor"], kind: "color" },
    { label: "透明度", path: ["regions", "composer", "opacity"], kind: "range", min: 0, max: 1, step: 0.01 },
    { label: "文字色", path: ["regions", "composer", "textColor"], kind: "color" },
    { label: "边框", path: ["regions", "composer", "borderColor"], kind: "color" },
    { label: "聚焦色", path: ["regions", "composer", "focusColor"], kind: "color" },
    { label: "圆角", path: ["regions", "composer", "borderRadius"], kind: "range", min: 0, max: 64, step: 1 }
  ],
  buttons: [
    { label: "主色", path: ["regions", "buttons", "primaryColor"], kind: "color" },
    { label: "普通背景", path: ["regions", "buttons", "backgroundColor"], kind: "color" },
    { label: "文字色", path: ["regions", "buttons", "textColor"], kind: "color" },
    { label: "边框", path: ["regions", "buttons", "borderColor"], kind: "color" },
    { label: "圆角", path: ["regions", "buttons", "borderRadius"], kind: "range", min: 0, max: 64, step: 1 },
    { label: "阴影", path: ["regions", "buttons", "shadowStrength"], kind: "range", min: 0, max: 1, step: 0.01 }
  ],
  settings: [
    { label: "面板背景", path: ["regions", "settings", "panelColor"], kind: "color" },
    { label: "透明度", path: ["regions", "settings", "opacity"], kind: "range", min: 0, max: 1, step: 0.01 }
  ]
};

function valueAt(theme: Theme, path: string[]): unknown {
  let value: unknown = theme;
  for (const part of path) value = (value as Record<string, unknown>)[part];
  return value;
}

function colorValue(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
}

function statusLabel(status: unknown): string {
  const kind = status && typeof status === "object" ? (status as { kind?: string }).kind : undefined;
  return ({
    "not-running": "豆包未启动", "restart-required": "需要确认重启", connecting: "正在连接",
    applied: "已应用", partial: "部分兼容", incompatible: "当前版本不兼容", error: "操作失败"
  } as Record<string, string>)[kind ?? ""] ?? "准备就绪";
}

export async function mountApp(root: HTMLElement, api: DoubaoSkinApi): Promise<void> {
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="wordmark"><span>豆</span><div><b>豆包皮肤版</b><small>Doubao AutoSkin</small></div></div>
        <div class="topbar__status"><i></i><span data-role="status">正在检查豆包…</span><button data-action="start">启动 / 连接</button></div>
      </header>
      <div class="workspace">
        <aside class="theme-panel">
          <div class="panel-title"><div><small>THEMES</small><h2>主题</h2></div><button data-action="duplicate" title="复制当前主题">＋</button></div>
          <div class="theme-list" data-role="themes"></div>
          <div class="theme-tools"><button data-action="import">导入 ZIP</button><button data-action="export">导出</button><button data-action="delete">删除</button></div>
        </aside>
        <main class="stage">
          <div class="stage__head"><div><small>LIVE PREVIEW</small><h1>本地效果预览</h1></div><div class="preview-tabs"><button class="is-active" data-preview-page="chat">聊天</button><button data-preview-page="settings">设置</button></div></div>
          <div class="preview-frame"><div data-role="preview"></div></div>
          <p class="stage__hint">预览不会打开或嵌入真实豆包页面，点击“应用到豆包”后才会注入。</p>
        </main>
        <aside class="control-panel">
          <div class="control-panel__head"><small>APPEARANCE</small><input data-role="theme-name" aria-label="主题名称"></div>
          <nav class="region-tabs" data-role="region-tabs"></nav>
          <section class="region-controls" data-role="region-controls"></section>
        </aside>
      </div>
      <footer class="actionbar">
        <div><button data-action="undo">撤销</button><button data-action="reset">重置当前区域</button></div>
        <div><button data-action="restore" class="danger">恢复官方外观</button><button data-action="save">保存主题</button><button data-action="apply" class="primary">应用到豆包</button></div>
      </footer>
    </div>`;

  const themeList = root.querySelector<HTMLElement>("[data-role='themes']")!;
  const controls = root.querySelector<HTMLElement>("[data-role='region-controls']")!;
  const tabs = root.querySelector<HTMLElement>("[data-role='region-tabs']")!;
  const preview = root.querySelector<HTMLElement>("[data-role='preview']")!;
  const status = root.querySelector<HTMLElement>("[data-role='status']")!;
  const nameInput = root.querySelector<HTMLInputElement>("[data-role='theme-name']")!;
  let summaries: ThemeSummary[] = [];
  let selectedSummary: ThemeSummary | undefined;
  let state: EditorState;
  let activeRegion: EditableRegion = "wallpaper";
  let previewPage: PreviewPage = "chat";
  let pendingWallpaper: WallpaperSelection | undefined;
  let wallpaperUrl: string | undefined;

  const setStatus = (value: unknown) => { status.textContent = statusLabel(value); };

  const ensureEditable = async (): Promise<void> => {
    if (!selectedSummary?.readOnly) return;
    const copy = await api.duplicateTheme(selectedSummary.id);
    summaries = await api.listThemes();
    selectedSummary = summaries.find((item) => item.id === copy.id) ?? copy;
    state = createEditorState(await api.loadTheme(copy.id));
  };

  const renderThemeList = (): void => {
    themeList.replaceChildren();
    for (const item of summaries) {
      const button = document.createElement("button");
      button.className = `theme-card${item.id === state?.theme.id ? " is-active" : ""}`;
      button.dataset.themeId = item.id;
      button.innerHTML = `<span class="theme-card__swatch"></span><span><b></b><small></small></span><em>${item.readOnly ? "内置" : "自定义"}</em>`;
      button.querySelector("b")!.textContent = item.name;
      button.querySelector("small")!.textContent = item.author;
      button.addEventListener("click", () => void loadTheme(item.id));
      themeList.append(button);
    }
  };

  const renderControls = (): void => {
    tabs.replaceChildren();
    for (const region of REGIONS) {
      const button = document.createElement("button");
      button.textContent = region.label;
      button.className = region.id === activeRegion ? "is-active" : "";
      button.addEventListener("click", () => { activeRegion = region.id; renderControls(); });
      tabs.append(button);
    }
    controls.replaceChildren();
    if (activeRegion === "wallpaper") {
      const choose = document.createElement("button");
      choose.className = "wallpaper-picker";
      choose.innerHTML = `<span>选择静态壁纸</span><small></small>`;
      choose.querySelector("small")!.textContent = state.theme.wallpaper.file;
      choose.addEventListener("click", () => void chooseWallpaper());
      controls.append(choose);
      const fitLabel = document.createElement("label");
      fitLabel.className = "control-row";
      fitLabel.innerHTML = `<span>填充方式</span><select><option value="cover">铺满</option><option value="contain">完整显示</option></select>`;
      const select = fitLabel.querySelector("select")!;
      select.value = state.theme.wallpaper.fit;
      select.addEventListener("change", () => void change(["wallpaper", "fit"], select.value));
      controls.append(fitLabel);
    }
    for (const descriptor of CONTROLS[activeRegion]) {
      const row = document.createElement("label");
      row.className = "control-row";
      const current = valueAt(state.theme, descriptor.path);
      const label = document.createElement("span");
      label.textContent = descriptor.label;
      row.append(label);
      if (descriptor.kind === "color") {
        const group = document.createElement("span");
        group.className = "color-control";
        const input = document.createElement("input");
        input.type = "color";
        input.value = colorValue(current);
        const output = document.createElement("code");
        output.textContent = String(current);
        input.addEventListener("input", () => void change(descriptor.path, input.value));
        group.append(input, output);
        row.append(group);
      } else {
        const group = document.createElement("span");
        group.className = "range-control";
        const range = document.createElement("input");
        range.type = "range";
        range.min = String(descriptor.min); range.max = String(descriptor.max); range.step = String(descriptor.step);
        range.value = String(current);
        const number = document.createElement("input");
        number.type = "number";
        number.min = range.min; number.max = range.max; number.step = range.step; number.value = range.value;
        range.addEventListener("input", () => { number.value = range.value; void change(descriptor.path, Number(range.value)); });
        number.addEventListener("change", () => { range.value = number.value; void change(descriptor.path, Number(number.value)); });
        group.append(range, number);
        row.append(group);
      }
      controls.append(row);
    }
  };

  const render = (): void => {
    nameInput.value = state.theme.name;
    renderThemeList();
    renderControls();
    renderPreview(preview, state.theme, previewPage, wallpaperUrl);
    root.querySelector<HTMLButtonElement>("[data-action='undo']")!.disabled = state.undoStack.length === 0;
    root.querySelector<HTMLButtonElement>("[data-action='delete']")!.disabled = Boolean(selectedSummary?.readOnly);
  };

  const loadTheme = async (id: string): Promise<void> => {
    selectedSummary = summaries.find((item) => item.id === id);
    state = createEditorState(await api.loadTheme(id));
    pendingWallpaper = undefined;
    if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
    wallpaperUrl = undefined;
    render();
  };

  const change = async (path: string[], value: unknown): Promise<void> => {
    await ensureEditable();
    state = updateField(state, path, value);
    render();
  };

  const chooseWallpaper = async (): Promise<void> => {
    const selection = await api.chooseWallpaper();
    if (!selection) return;
    await ensureEditable();
    pendingWallpaper = selection;
    const copy = Uint8Array.from(selection.bytes);
    const derived = await extractPalette(copy.buffer, selection.mime);
    state = updateField(state, ["wallpaper", "file"], selection.name);
    state = updateField(state, ["palette"], {
      ink: derived.ink, mutedInk: derived.mutedInk, accent: derived.accent, surface: derived.surface
    });
    if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
    wallpaperUrl = URL.createObjectURL(new Blob([copy], { type: selection.mime }));
    render();
  };

  const saveDraft = async (): Promise<ThemeSummary> => {
    await ensureEditable();
    const saved = await api.saveTheme({ theme: state.theme, wallpaper: pendingWallpaper });
    summaries = await api.listThemes();
    selectedSummary = summaries.find((item) => item.id === saved.id) ?? saved;
    state = createEditorState(state.theme);
    pendingWallpaper = undefined;
    render();
    setStatus({ kind: "applied", message: "主题已保存" });
    return saved;
  };

  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-preview-page]")) {
    button.addEventListener("click", () => {
      previewPage = button.dataset.previewPage as PreviewPage;
      for (const item of root.querySelectorAll("[data-preview-page]")) item.classList.toggle("is-active", item === button);
      renderPreview(preview, state.theme, previewPage, wallpaperUrl);
    });
  }
  nameInput.addEventListener("change", () => void change(["name"], nameInput.value.trim() || state.theme.name));
  root.querySelector("[data-action='undo']")!.addEventListener("click", () => { state = undo(state); render(); });
  root.querySelector("[data-action='reset']")!.addEventListener("click", () => void ensureEditable().then(() => { state = resetRegion(state, activeRegion); render(); }));
  root.querySelector("[data-action='save']")!.addEventListener("click", () => void saveDraft().catch((error) => setStatus({ kind: "error", error })));
  root.querySelector("[data-action='apply']")!.addEventListener("click", () => void (async () => {
    const id = state.dirty || pendingWallpaper ? (await saveDraft()).id : state.theme.id;
    setStatus(await api.applyTheme(id));
  })().catch((error) => setStatus({ kind: "error", error })));
  root.querySelector("[data-action='restore']")!.addEventListener("click", () => void api.restoreOfficial().then(() => setStatus({ kind: "not-running" })));
  root.querySelector("[data-action='start']")!.addEventListener("click", () => void api.startDoubao().then(setStatus));
  root.querySelector("[data-action='duplicate']")!.addEventListener("click", () => void api.duplicateTheme(state.theme.id).then(async (copy) => {
    summaries = await api.listThemes(); await loadTheme(copy.id);
  }));
  root.querySelector("[data-action='delete']")!.addEventListener("click", () => void api.deleteTheme(state.theme.id).then(async () => {
    summaries = await api.listThemes(); if (summaries[0]) await loadTheme(summaries[0].id);
  }));
  root.querySelector("[data-action='import']")!.addEventListener("click", () => void api.importTheme().then(async (item) => {
    if (item) { summaries = await api.listThemes(); await loadTheme(item.id); }
  }));
  root.querySelector("[data-action='export']")!.addEventListener("click", () => void api.exportTheme(state.theme.id));

  summaries = await api.listThemes();
  if (summaries.length === 0) throw new Error("No themes are available");
  await loadTheme(summaries[0].id);
  setStatus(await api.getStatus());
}

if (typeof window !== "undefined" && window.doubaoSkin) {
  const root = document.querySelector<HTMLElement>("#app");
  if (root) void mountApp(root, window.doubaoSkin);
}
