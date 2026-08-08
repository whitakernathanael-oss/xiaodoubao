import type { DoubaoAdapter, Theme } from "../shared/contracts";

export interface InjectionResult {
  status: "compatible" | "partial" | "incompatible";
  missingRequired: string[];
  missingOptional: string[];
}

interface EvaluationSession {
  evaluate(expression: string): Promise<unknown>;
  onEvent?(method: string, listener: () => void): () => void;
}

async function applyRuntime(theme: Theme, adapter: DoubaoAdapter, wallpaperDataUrl: string, extraCss: string): Promise<InjectionResult> {
  const STYLE_ID = "doubao-autoskin-style";
  const WALLPAPER_ID = "doubao-autoskin-wallpaper";
  const STATE_KEY = "__DOUBAO_SKIN_STATE__";
  const root = document.documentElement;
  const global = window as unknown as Record<string, any>;
  const previous = global[STATE_KEY];
  const classNames: Record<string, string> = {
    appRoot: "dbs-app-root", sidebar: "dbs-sidebar", chatArea: "dbs-chat-area",
    messageUser: "dbs-message-user", messageAssistant: "dbs-message-assistant",
    composer: "dbs-composer", buttons: "dbs-button", settingsPanel: "dbs-settings-panel"
  };

  const find = (): Record<string, Element[]> => {
    const found: Record<string, Element[]> = {};
    for (const [region, selectors] of Object.entries(adapter.regions)) {
      found[region] = [];
      for (const selector of selectors) {
        try {
          const nodes = [...document.querySelectorAll(selector)];
          if (nodes.length > 0) { found[region] = nodes; break; }
        } catch { /* Invalid selectors behave as no match. */ }
      }
    }
    return found;
  };
  const initial = find();
  const pageState = initial.settingsPanel.length > 0 ? "settings" : "chat";
  const required = adapter.pageStates[pageState].requiredRegions;
  const missingRequired = required.filter((region) => initial[region].length === 0);
  const missingOptional = Object.keys(adapter.regions).filter((region) =>
    !required.includes(region as never) && adapter.regions[region as keyof typeof adapter.regions].length > 0 && initial[region].length === 0
  );

  const clear = (): void => {
    previous?.observer?.disconnect?.();
    if (previous?.blobUrl) URL.revokeObjectURL(previous.blobUrl);
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(WALLPAPER_ID)?.remove();
    for (const element of document.querySelectorAll("*")) {
      for (const name of [...element.classList]) if (name.startsWith("dbs-")) element.classList.remove(name);
    }
    root.classList.remove("doubao-skin");
    for (const name of [...root.classList]) if (name.startsWith("theme-")) root.classList.remove(name);
    for (const property of [...root.style]) if (property.startsWith("--dbs-")) root.style.removeProperty(property);
    delete global[STATE_KEY];
  };
  if (missingRequired.length > 0) {
    clear();
    return { status: "incompatible", missingRequired, missingOptional };
  }

  previous?.observer?.disconnect?.();
  const marked = new Set<Element>();
  const mark = (): void => {
    for (const element of marked) element.classList.remove(...Object.values(classNames));
    marked.clear();
    const current = find();
    for (const [region, elements] of Object.entries(current)) {
      for (const element of elements) {
        element.classList.add(classNames[region]);
        marked.add(element);
      }
    }
  };
  mark();
  root.classList.add("doubao-skin", `theme-${theme.id}`);
  for (const name of [...root.classList]) {
    if (name.startsWith("theme-") && name !== `theme-${theme.id}`) root.classList.remove(name);
  }

  const variables: Record<string, string> = {
    "--dbs-ink": theme.palette.ink,
    "--dbs-muted-ink": theme.palette.mutedInk,
    "--dbs-accent": theme.palette.accent,
    "--dbs-surface": theme.palette.surface,
    "--dbs-sidebar-bg": theme.regions.sidebar.backgroundColor,
    "--dbs-sidebar-opacity": String(theme.regions.sidebar.opacity),
    "--dbs-chat-bg": theme.regions.chat.backgroundColor,
    "--dbs-chat-opacity": String(theme.regions.chat.opacity),
    "--dbs-user-bubble": theme.regions.chat.userBubbleColor,
    "--dbs-assistant-bubble": theme.regions.chat.assistantBubbleColor,
    "--dbs-composer-bg": theme.regions.composer.backgroundColor,
    "--dbs-composer-opacity": String(theme.regions.composer.opacity),
    "--dbs-button-primary": theme.regions.buttons.primaryColor,
    "--dbs-settings-bg": theme.regions.settings.panelColor,
    "--dbs-settings-opacity": String(theme.regions.settings.opacity)
  };
  for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);

  let blobUrl = previous?.wallpaperDataUrl === wallpaperDataUrl ? previous.blobUrl : undefined;
  if (!blobUrl) {
    if (previous?.blobUrl) URL.revokeObjectURL(previous.blobUrl);
    blobUrl = URL.createObjectURL(await (await fetch(wallpaperDataUrl)).blob());
  }
  let wallpaper = document.getElementById(WALLPAPER_ID) as HTMLDivElement | null;
  if (!wallpaper) {
    wallpaper = document.createElement("div");
    wallpaper.id = WALLPAPER_ID;
    document.body.prepend(wallpaper);
  }
  Object.assign(wallpaper.style, {
    position: "fixed", inset: "0", pointerEvents: "none", zIndex: "0",
    backgroundImage: `url(${JSON.stringify(blobUrl)})`,
    backgroundRepeat: "no-repeat", backgroundSize: `${theme.wallpaper.fit}`,
    backgroundPosition: `${theme.wallpaper.positionX}% ${theme.wallpaper.positionY}%`,
    filter: `blur(${theme.wallpaper.blur}px) brightness(${theme.wallpaper.brightness}%)`,
    transform: `scale(${theme.wallpaper.scale / 100})`
  });
  wallpaper.style.setProperty("--dbs-wallpaper-overlay", theme.wallpaper.overlayColor);
  wallpaper.style.setProperty("--dbs-wallpaper-overlay-opacity", String(theme.wallpaper.overlayOpacity));

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = `
#doubao-autoskin-wallpaper { pointer-events: none !important; }
html.doubao-skin body, html.doubao-skin .dbs-app-root { background: transparent !important; position: relative; }
html.doubao-skin .dbs-app-root { z-index: 1; color: var(--dbs-ink) !important; }
html.doubao-skin .dbs-sidebar { background: color-mix(in srgb, var(--dbs-sidebar-bg) calc(var(--dbs-sidebar-opacity) * 100%), transparent) !important; color: var(--dbs-ink) !important; }
html.doubao-skin .dbs-chat-area { background: color-mix(in srgb, var(--dbs-chat-bg) calc(var(--dbs-chat-opacity) * 100%), transparent) !important; }
html.doubao-skin .dbs-message-user { background: var(--dbs-user-bubble) !important; }
html.doubao-skin .dbs-message-assistant { background: var(--dbs-assistant-bubble) !important; }
html.doubao-skin .dbs-composer { background: color-mix(in srgb, var(--dbs-composer-bg) calc(var(--dbs-composer-opacity) * 100%), transparent) !important; }
html.doubao-skin .dbs-button { --primary-color: var(--dbs-button-primary); }
html.doubao-skin .dbs-settings-panel { background: color-mix(in srgb, var(--dbs-settings-bg) calc(var(--dbs-settings-opacity) * 100%), transparent) !important; }
${extraCss}`;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(mark, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  global[STATE_KEY] = { observer, blobUrl, wallpaperDataUrl, marked, themeClass: `theme-${theme.id}` };
  return { status: missingOptional.length > 0 ? "partial" : "compatible", missingRequired, missingOptional };
}

function cleanupRuntime(): boolean {
  const STYLE_ID = "doubao-autoskin-style";
  const WALLPAPER_ID = "doubao-autoskin-wallpaper";
  const STATE_KEY = "__DOUBAO_SKIN_STATE__";
  const root = document.documentElement;
  const global = window as unknown as Record<string, any>;
  const state = global[STATE_KEY];
  state?.observer?.disconnect?.();
  if (state?.blobUrl) URL.revokeObjectURL(state.blobUrl);
  document.getElementById(STYLE_ID)?.remove();
  document.getElementById(WALLPAPER_ID)?.remove();
  for (const element of document.querySelectorAll("*")) {
    for (const name of [...element.classList]) if (name.startsWith("dbs-")) element.classList.remove(name);
  }
  root.classList.remove("doubao-skin");
  for (const name of [...root.classList]) if (name.startsWith("theme-")) root.classList.remove(name);
  for (const property of [...root.style]) if (property.startsWith("--dbs-")) root.style.removeProperty(property);
  delete global[STATE_KEY];
  return true;
}

export function buildApplyExpression(
  theme: Theme,
  adapter: DoubaoAdapter,
  wallpaperDataUrl: string,
  extraCss: string
): string {
  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(wallpaperDataUrl)) {
    throw new Error("Wallpaper Data URL is invalid");
  }
  return `(${applyRuntime.toString()})(${JSON.stringify(theme)},${JSON.stringify(adapter)},${JSON.stringify(wallpaperDataUrl)},${JSON.stringify(extraCss)})`;
}

export function buildCleanupExpression(): string {
  return `(${cleanupRuntime.toString()})()`;
}

export class Injector {
  private lastApply?: { theme: Theme; wallpaperDataUrl: string; extraCss: string };

  constructor(
    private readonly session: EvaluationSession,
    private readonly adapter: DoubaoAdapter
  ) {
    session.onEvent?.("Page.loadEventFired", () => {
      if (this.lastApply) void this.apply(this.lastApply.theme, this.lastApply.wallpaperDataUrl, this.lastApply.extraCss);
    });
  }

  async apply(theme: Theme, wallpaperDataUrl: string, extraCss = ""): Promise<InjectionResult> {
    this.lastApply = { theme, wallpaperDataUrl, extraCss };
    return await this.session.evaluate(buildApplyExpression(theme, this.adapter, wallpaperDataUrl, extraCss)) as InjectionResult;
  }

  async verify(): Promise<boolean> {
    return Boolean(await this.session.evaluate(`Boolean(
      window.__DOUBAO_SKIN_STATE__ &&
      document.getElementById("doubao-autoskin-style") &&
      document.getElementById("doubao-autoskin-wallpaper") &&
      document.documentElement.classList.contains("doubao-skin")
    )`));
  }

  async restore(): Promise<void> {
    this.lastApply = undefined;
    await this.session.evaluate(buildCleanupExpression());
  }
}
