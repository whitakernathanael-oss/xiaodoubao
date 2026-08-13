import "./styles.css";
import { extractPalette } from "./palette";
import { createEditorState, updateField, type EditorState } from "./editor-state";
import { renderPreview, type PreviewPage } from "./preview";
import type { Theme, ThemeSummary } from "../shared/contracts";
import { DEFAULT_THEME } from "../shared/defaults";
import type { DoubaoSkinApi, WallpaperSelection } from "../shared/ipc";
import { applyDerivedPalette } from "../shared/theme-coloring";

type Control = {
  label: string;
  path: string[];
  min?: number;
  max?: number;
  step?: number;
};

const WALLPAPER_CONTROLS: Control[] = [
  { label: "水平位置", path: ["wallpaper", "positionX"], min: 0, max: 100, step: 1 },
  { label: "垂直位置", path: ["wallpaper", "positionY"], min: 0, max: 100, step: 1 },
  { label: "缩放", path: ["wallpaper", "scale"], min: 25, max: 300, step: 1 },
  { label: "模糊", path: ["wallpaper", "blur"], min: 0, max: 40, step: 1 },
  { label: "亮度", path: ["wallpaper", "brightness"], min: 0, max: 200, step: 1 }
];

function valueAt(theme: Theme, path: string[]): unknown {
  let value: unknown = theme;
  for (const part of path) value = (value as Record<string, unknown>)[part];
  return value;
}

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

function statusLabel(status: unknown): string {
  const details = status && typeof status === "object" ? status as { kind?: string; message?: string } : undefined;
  if (details?.message) return details.message;
  const kind = details?.kind;
  return ({
    "not-running": "豆包未启动", "restart-required": "需要确认重启", connecting: "正在连接",
    applied: "已应用", partial: "部分兼容", incompatible: "当前版本不兼容", disabled: "皮肤已暂时停用", error: "操作失败"
  } as Record<string, string>)[kind ?? ""] ?? "准备就绪";
}

export async function mountApp(root: HTMLElement, api: DoubaoSkinApi): Promise<void> {
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="wordmark"><span>豆</span><div><b>豆包皮肤版</b><small>Doubao AutoSkin</small></div></div>
        <div class="topbar__status" data-status-kind="connecting"><span data-role="current-theme"></span><i></i><span data-role="status">正在检查豆包…</span><details class="more-actions"><summary>更多</summary><button data-action="delete">删除</button></details><button data-action="start">启动 / 连接</button></div>
      </header>
      <div class="workspace">
        <aside class="theme-panel">
          <div class="panel-title"><div><small>THEMES</small><h2>主题</h2></div></div>
          <div class="theme-list" data-role="themes"></div>
          <div class="theme-tools"><button data-action="import">导入 ZIP</button><button data-action="export">导出</button></div>
        </aside>
        <main class="stage">
          <div class="stage__head"><div><small>LIVE PREVIEW</small><h1>本地效果预览</h1></div><div class="preview-tabs"><button class="is-active" data-preview-page="chat">聊天</button><button data-preview-page="settings">设置</button></div></div>
          <div class="preview-frame"><div data-role="preview"></div></div>
          <p class="stage__hint">预览不会打开或嵌入真实豆包页面，点击“应用到豆包”后才会注入。</p>
        </main>
        <aside class="control-panel">
          <section class="appearance-panel"><div class="control-panel__head"><small>外观</small><input data-role="theme-name" aria-label="主题名称"></div><section class="region-controls" data-role="region-controls"></section></section>
          <section class="automation-panel"><h2>自动运行</h2><label class="persistence"><input type="checkbox" data-action="persistence">自动保持皮肤</label><label class="persistence"><input type="checkbox" data-action="confirm-before-restart">关闭豆包前询问我</label><label class="persistence"><input type="checkbox" data-action="temporarily-disable-skin">暂时停用皮肤</label><small data-role="temporary-disable-help">暂停后台检测与开机启动，不删除已保存主题，也不会立即移除当前豆包皮肤。重新启用后，有已保存主题时恢复后台运行。</small></section>
        </aside>
      </div>
      <footer class="actionbar">
        <div class="actionbar__restore"><button data-action="restore" class="danger">恢复官方外观</button></div>
        <div class="actionbar__commit"><button data-action="save">保存主题</button><button data-action="apply" class="primary">应用到豆包</button></div>
      </footer>
    </div>`;

  const themeList = root.querySelector<HTMLElement>("[data-role='themes']")!;
  const controls = root.querySelector<HTMLElement>("[data-role='region-controls']")!;
  const preview = root.querySelector<HTMLElement>("[data-role='preview']")!;
  const status = root.querySelector<HTMLElement>("[data-role='status']")!;
  const statusIndicator = root.querySelector<HTMLElement>(".topbar__status")!;
  const currentTheme = root.querySelector<HTMLElement>("[data-role='current-theme']")!;
  const nameInput = root.querySelector<HTMLInputElement>("[data-role='theme-name']")!;
  const persistence = root.querySelector<HTMLInputElement>("[data-action='persistence']")!;
  const confirmBeforeRestart = root.querySelector<HTMLInputElement>("[data-action='confirm-before-restart']")!;
  const temporarilyDisableSkin = root.querySelector<HTMLInputElement>("[data-action='temporarily-disable-skin']")!;
  let summaries: ThemeSummary[] = [];
  let selectedSummary: ThemeSummary | undefined;
  let state: EditorState;
  let previewPage: PreviewPage = "chat";
  let pendingWallpaper: WallpaperSelection | undefined;
  let wallpaperUrl: string | undefined;
  let wallpaperRequest = 0;
  let wallpaperQueue = Promise.resolve();
  let persistenceQueue = Promise.resolve();
  let themeLoadRequest = 0;
  let persistenceRequest = 0;

  const enqueuePersistence = (task: () => Promise<void>): Promise<void> => {
    const next = persistenceQueue.then(task, task);
    persistenceQueue = next.catch(() => undefined);
    return next;
  };

  const setStatus = (value: unknown) => {
    status.textContent = statusLabel(value);
    const kind = value && typeof value === "object" && typeof (value as { kind?: unknown }).kind === "string"
      ? (value as { kind: string }).kind
      : "ready";
    statusIndicator.dataset.statusKind = kind;
  };

  const startOrConnect = async (): Promise<void> => {
    if (temporarilyDisableSkin.checked) { setStatus({ kind: "disabled", message: "皮肤已暂时停用" }); return; }
    let result = await api.startDoubao();
    const details = result && typeof result === "object" ? result as { kind?: string; reason?: string } : {};
    if (details.kind === "restart-required") {
      result = await api.confirmRestart();
    } else if (details.kind === "error" && details.reason === "doubao-not-found") {
      const executable = await api.chooseDoubaoExecutable();
      if (executable) result = await api.startDoubao();
    }
    setStatus(result);
  };

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
      const swatch = button.querySelector<HTMLElement>(".theme-card__swatch")!;
      swatch.style.setProperty("--theme-surface", item.surfaceColor);
      swatch.style.setProperty("--theme-accent", item.accentColor);
      button.addEventListener("click", () => void loadTheme(item.id));
      themeList.append(button);
    }
  };

  const renderControls = (): void => {
    controls.replaceChildren();
    const choose = document.createElement("button");
    choose.className = "wallpaper-picker";
    choose.innerHTML = `<span>选择静态壁纸</span><small></small>`;
    choose.querySelector("small")!.textContent = state.theme.wallpaper.file;
    choose.addEventListener("click", () => void chooseWallpaper().catch((error) => setStatus({ kind: "error", error })));
    controls.append(choose);
    const fitLabel = document.createElement("label");
    fitLabel.className = "control-row";
    fitLabel.innerHTML = `<span>填充方式</span><select><option value="cover">铺满</option><option value="contain">完整显示</option></select>`;
    const select = fitLabel.querySelector("select")!;
    select.value = state.theme.wallpaper.fit;
    select.addEventListener("change", () => void change(["wallpaper", "fit"], select.value));
    controls.append(fitLabel);
    for (const descriptor of WALLPAPER_CONTROLS) {
      const row = document.createElement("label");
      row.className = "control-row";
      const current = valueAt(state.theme, descriptor.path);
      const label = document.createElement("span");
      label.textContent = descriptor.label;
      row.append(label);
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
      controls.append(row);
    }
  };

  const render = (): void => {
    nameInput.value = state.theme.name;
    currentTheme.textContent = `当前：${state.theme.name}`;
    renderThemeList();
    renderControls();
    renderPreview(preview, state.theme, previewPage, wallpaperUrl);
    root.querySelector<HTMLButtonElement>("[data-action='delete']")!.disabled = Boolean(selectedSummary?.readOnly);
  };

  const loadTheme = async (id: string): Promise<void> => {
    const request = ++themeLoadRequest;
    ++wallpaperRequest;
    const [theme, wallpaper] = await Promise.all([api.loadTheme(id), api.loadWallpaper(id)]);
    if (request !== themeLoadRequest) return;
    selectedSummary = summaries.find((item) => item.id === id);
    state = createEditorState(theme);
    pendingWallpaper = undefined;
    if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
    const copy = Uint8Array.from(wallpaper.bytes);
    wallpaperUrl = URL.createObjectURL(new Blob([copy], { type: wallpaper.mime }));
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
    const request = ++wallpaperRequest;
    const process = async (): Promise<void> => {
      if (request !== wallpaperRequest) return;
      const matchingTheme = summaries.find((item) => !item.readOnly && item.wallpaperFile === selection.name);
      const theme = matchingTheme ? await api.loadTheme(matchingTheme.id) : structuredClone(DEFAULT_THEME);
      if (request !== wallpaperRequest) return;
      if (!matchingTheme) {
        theme.id = wallpaperThemeId(selection.name, summaries);
        theme.name = wallpaperStem(selection.name);
      }
      const copy = Uint8Array.from(selection.bytes);
      const derived = await extractPalette(copy.buffer, selection.mime);
      if (request !== wallpaperRequest) return;
      let nextState = createEditorState(theme);
      nextState = {
        ...nextState,
        theme: applyDerivedPalette(nextState.theme, derived),
        dirty: true
      };
      nextState = updateField(nextState, ["wallpaper", "file"], selection.name);
      selectedSummary = matchingTheme;
      state = nextState;
      pendingWallpaper = selection;
      if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
      wallpaperUrl = URL.createObjectURL(new Blob([copy], { type: selection.mime }));
      render();
      try {
        await saveDraft(false, `已自动保存：${nextState.theme.name}`, {
          theme: nextState.theme, wallpaper: selection, request
        });
      } catch (error) {
        if (request === wallpaperRequest) throw error;
      }
    };
    const task = wallpaperQueue.then(process, process);
    wallpaperQueue = task.catch(() => undefined);
    await task;
  };

  const saveDraft = async (
    makeEditable = true,
    message = "主题已保存",
    snapshot?: { theme: Theme; wallpaper: WallpaperSelection; request: number }
  ): Promise<ThemeSummary> => {
    if (makeEditable) await ensureEditable();
    const theme = snapshot?.theme ?? state.theme;
    const wallpaper = snapshot?.wallpaper ?? pendingWallpaper;
    const saved = await api.saveTheme({ theme, wallpaper });
    const nextSummaries = await api.listThemes();
    summaries = nextSummaries;
    if (snapshot && snapshot.request !== wallpaperRequest) return saved;
    selectedSummary = summaries.find((item) => item.id === saved.id) ?? saved;
    state = createEditorState(theme);
    pendingWallpaper = undefined;
    render();
    setStatus({ kind: "applied", message });
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
  root.querySelector("[data-action='save']")!.addEventListener("click", () => void saveDraft().catch((error) => setStatus({ kind: "error", error })));
  root.querySelector("[data-action='apply']")!.addEventListener("click", () => void (async () => {
    const id = state.dirty || pendingWallpaper ? (await saveDraft()).id : state.theme.id;
    setStatus(await api.applyTheme(id));
  })().catch((error) => setStatus({ kind: "error", error })));
  root.querySelector("[data-action='restore']")!.addEventListener("click", () => {
    const request = ++persistenceRequest;
    return void enqueuePersistence(async () => {
      await api.restoreOfficial();
      if (request !== persistenceRequest) return;
      persistence.checked = (await api.getSkinPersistence()).enabled;
      setStatus({ kind: "not-running" });
    }).catch((error) => setStatus({ kind: "error", error }));
  });
  persistence.addEventListener("change", () => {
    const request = ++persistenceRequest;
    const enabledIntent = persistence.checked;
    void enqueuePersistence(async () => {
      if (!enabledIntent) {
        const result = await api.setSkinPersistence(false);
        if (request !== persistenceRequest) return;
        persistence.checked = result.enabled;
        setStatus({ kind: "applied", message: "关闭后不自动恢复" });
        return;
      }
      const saved = await saveDraft();
      if (request !== persistenceRequest) return;
      const enabled = await api.setSkinPersistence(true);
      if (request !== persistenceRequest) return;
      persistence.checked = enabled.enabled;
      if (!enabled.enabled) return;
      const applied = await api.applyTheme(saved.id);
      if (request !== persistenceRequest) return;
      const kind = applied && typeof applied === "object" ? (applied as { kind?: string }).kind : undefined;
      if (kind === "applied" || kind === "partial") {
        setStatus({ kind, message: "自动保持皮肤已开启" });
      } else {
        setStatus(applied);
      }
    }).catch((error) => setStatus({ kind: "error", error }));
  });
  const saveAutomation = () => void api.setSkinAutomation({
    confirmBeforeRestart: confirmBeforeRestart.checked,
    temporarilyDisabled: temporarilyDisableSkin.checked
  }).then((result) => {
    confirmBeforeRestart.checked = result.confirmBeforeRestart;
    temporarilyDisableSkin.checked = result.temporarilyDisabled;
    setStatus({ kind: result.temporarilyDisabled ? "disabled" : "applied", message: result.temporarilyDisabled ? "皮肤已暂时停用" : "皮肤自动恢复已开启" });
  }).catch((error) => setStatus({ kind: "error", error }));
  confirmBeforeRestart.addEventListener("change", saveAutomation);
  temporarilyDisableSkin.addEventListener("change", saveAutomation);
  root.querySelector("[data-action='start']")!.addEventListener("click", () => void startOrConnect().catch((error) => setStatus({ kind: "error", error })));
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
  persistence.checked = (await api.getSkinPersistence()).enabled;
  const automation = await api.getSkinAutomation();
  confirmBeforeRestart.checked = automation.confirmBeforeRestart;
  temporarilyDisableSkin.checked = automation.temporarilyDisabled;
  setStatus(await api.getStatus());
}

if (typeof window !== "undefined" && window.doubaoSkin) {
  const root = document.querySelector<HTMLElement>("#app");
  if (root) void mountApp(root, window.doubaoSkin);
}
