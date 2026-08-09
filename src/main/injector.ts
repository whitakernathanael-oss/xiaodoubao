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
    for (let index = root.style.length - 1; index >= 0; index -= 1) {
      const property = root.style.item(index);
      if (property.startsWith("--dbs-")) root.style.removeProperty(property);
    }
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

  const foregroundTarget = [
    initial.messageUser[0], initial.messageAssistant[0], initial.composer[0], initial.chatArea[0], document.body
  ].find((element): element is Element => Boolean(element));
  const foreground = foregroundTarget ? getComputedStyle(foregroundTarget).color : "";
  const channels = foreground.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
  const foregroundLuminance = channels.length === 3
    ? (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255
    : (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? 1 : 0);
  const hasLightText = foregroundLuminance >= 0.5;
  const safetyBase = hasLightText ? "#000000" : "#ffffff";
  const safeMix = (opacity: number, minimum: number): string =>
    `${Math.round(Math.max(minimum, Math.min(88, 54 + (1 - opacity) * 28)))}%`;

  const variables: Record<string, string> = {
    "--dbs-sidebar-bg": theme.regions.sidebar.backgroundColor,
    "--dbs-sidebar-selected": theme.regions.sidebar.selectedColor,
    "--dbs-sidebar-border": theme.regions.sidebar.borderColor,
    "--dbs-sidebar-radius": `${theme.regions.sidebar.borderRadius}px`,
    "--dbs-chat-bg": theme.regions.chat.backgroundColor,
    "--dbs-user-bubble": theme.regions.chat.userBubbleColor,
    "--dbs-assistant-bubble": theme.regions.chat.assistantBubbleColor,
    "--dbs-chat-border": theme.regions.chat.borderColor,
    "--dbs-chat-radius": `${theme.regions.chat.borderRadius}px`,
    "--dbs-chat-shadow": String(theme.regions.chat.shadowStrength),
    "--dbs-composer-bg": theme.regions.composer.backgroundColor,
    "--dbs-composer-border": theme.regions.composer.borderColor,
    "--dbs-composer-radius": `${theme.regions.composer.borderRadius}px`,
    "--dbs-composer-focus": theme.regions.composer.focusColor,
    "--dbs-button-primary": theme.regions.buttons.primaryColor,
    "--dbs-button-bg": theme.regions.buttons.backgroundColor,
    "--dbs-button-border": theme.regions.buttons.borderColor,
    "--dbs-button-radius": `${theme.regions.buttons.borderRadius}px`,
    "--dbs-button-shadow": String(theme.regions.buttons.shadowStrength),
    "--dbs-settings-bg": theme.regions.settings.panelColor,
    "--dbs-contrast-base": safetyBase,
    "--dbs-wallpaper-safety-opacity": hasLightText ? "0.64" : "0.68",
    "--dbs-sidebar-safety-mix": safeMix(theme.regions.sidebar.opacity, 58),
    "--dbs-chat-safety-mix": safeMix(theme.regions.chat.opacity, 62),
    "--dbs-composer-safety-mix": safeMix(theme.regions.composer.opacity, 64),
    "--dbs-button-safety-mix": safeMix(1, 58),
    "--dbs-settings-safety-mix": safeMix(theme.regions.settings.opacity, 64)
  };
  for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);

  let blobUrl = previous?.wallpaperDataUrl === wallpaperDataUrl ? previous.blobUrl : undefined;
  if (!blobUrl) {
    if (previous?.blobUrl) URL.revokeObjectURL(previous.blobUrl);
    blobUrl = URL.createObjectURL(await (await fetch(wallpaperDataUrl)).blob());
  }
  const wallpaperHost = (initial.chatArea[0] ?? initial.appRoot[0]) as HTMLElement;
  wallpaperHost.classList.add("dbs-wallpaper-host");
  let wallpaper = document.getElementById(WALLPAPER_ID) as HTMLDivElement | null;
  if (!wallpaper) {
    wallpaper = document.createElement("div");
    wallpaper.id = WALLPAPER_ID;
    wallpaperHost.prepend(wallpaper);
  }
  if (wallpaper.parentElement !== wallpaperHost) wallpaperHost.prepend(wallpaper);
  Object.assign(wallpaper.style, {
    position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0",
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
#doubao-autoskin-wallpaper { pointer-events: none !important; overflow: hidden !important; }
#doubao-autoskin-wallpaper::before, #doubao-autoskin-wallpaper::after { content: ""; position: absolute; inset: 0; pointer-events: none; }
#doubao-autoskin-wallpaper::before { background: var(--dbs-contrast-base); opacity: var(--dbs-wallpaper-safety-opacity); }
#doubao-autoskin-wallpaper::after { background: var(--dbs-wallpaper-overlay); opacity: var(--dbs-wallpaper-overlay-opacity); }
html.doubao-skin :is(.dbs-chat-area, .dbs-wallpaper-host) { position: relative !important; isolation: isolate !important; background: color-mix(in srgb, var(--dbs-contrast-base) var(--dbs-chat-safety-mix), var(--dbs-chat-bg)) !important; }
html.doubao-skin :is(.dbs-chat-area, .dbs-wallpaper-host) > :not(#doubao-autoskin-wallpaper) { position: relative !important; z-index: 1 !important; }
html.doubao-skin .dbs-sidebar { background: color-mix(in srgb, var(--dbs-contrast-base) var(--dbs-sidebar-safety-mix), var(--dbs-sidebar-bg)) !important; border-color: var(--dbs-sidebar-border) !important; border-radius: var(--dbs-sidebar-radius) !important; }
html.doubao-skin .dbs-sidebar :is([aria-selected="true"], [data-state="active"], .active) { background: color-mix(in srgb, var(--dbs-contrast-base) 46%, var(--dbs-sidebar-selected)) !important; }
html.doubao-skin .dbs-message-user { background: color-mix(in srgb, var(--dbs-contrast-base) var(--dbs-chat-safety-mix), var(--dbs-user-bubble)) !important; border: 1px solid var(--dbs-chat-border) !important; border-radius: var(--dbs-chat-radius) !important; box-shadow: 0 8px 28px rgb(0 0 0 / calc(var(--dbs-chat-shadow) * .35)) !important; }
html.doubao-skin .dbs-message-assistant { background: color-mix(in srgb, var(--dbs-contrast-base) var(--dbs-chat-safety-mix), var(--dbs-assistant-bubble)) !important; border: 1px solid var(--dbs-chat-border) !important; border-radius: var(--dbs-chat-radius) !important; box-shadow: 0 8px 28px rgb(0 0 0 / calc(var(--dbs-chat-shadow) * .35)) !important; }
html.doubao-skin .dbs-composer { background: color-mix(in srgb, var(--dbs-contrast-base) var(--dbs-composer-safety-mix), var(--dbs-composer-bg)) !important; border: 1px solid var(--dbs-composer-border) !important; border-radius: var(--dbs-composer-radius) !important; }
html.doubao-skin .dbs-composer:focus-within { border-color: var(--dbs-composer-focus) !important; }
html.doubao-skin .dbs-button { --primary-color: var(--dbs-button-primary); background-color: color-mix(in srgb, var(--dbs-contrast-base) var(--dbs-button-safety-mix), var(--dbs-button-bg)) !important; border-color: var(--dbs-button-border) !important; border-radius: var(--dbs-button-radius) !important; box-shadow: 0 6px 20px rgb(0 0 0 / calc(var(--dbs-button-shadow) * .3)) !important; }
html.doubao-skin .dbs-settings-panel { background: color-mix(in srgb, var(--dbs-contrast-base) var(--dbs-settings-safety-mix), var(--dbs-settings-bg)) !important; }
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
  for (let index = root.style.length - 1; index >= 0; index -= 1) {
    const property = root.style.item(index);
    if (property.startsWith("--dbs-")) root.style.removeProperty(property);
  }
  delete global[STATE_KEY];
  return true;
}

function verifyRuntime(adapter: DoubaoAdapter): boolean {
  const classNames: Record<string, string> = {
    appRoot: "dbs-app-root", sidebar: "dbs-sidebar", chatArea: "dbs-chat-area",
    messageUser: "dbs-message-user", messageAssistant: "dbs-message-assistant",
    composer: "dbs-composer", buttons: "dbs-button", settingsPanel: "dbs-settings-panel"
  };
  const settings = document.querySelector(`.${classNames.settingsPanel}`);
  const pageState = settings ? "settings" : "chat";
  const visible = (element: Element | null): boolean => {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  return Boolean(
    (window as unknown as Record<string, unknown>).__DOUBAO_SKIN_STATE__
    && document.getElementById("doubao-autoskin-style")
    && visible(document.getElementById("doubao-autoskin-wallpaper"))
    && document.documentElement.classList.contains("doubao-skin")
    && adapter.pageStates[pageState].requiredRegions.every((region) =>
      visible(document.querySelector(`.${classNames[region]}`))
    )
  );
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

export function buildVerifyExpression(adapter: DoubaoAdapter): string {
  return `(${verifyRuntime.toString()})(${JSON.stringify(adapter)})`;
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
    return Boolean(await this.session.evaluate(buildVerifyExpression(this.adapter)));
  }

  async restore(): Promise<void> {
    this.lastApply = undefined;
    await this.session.evaluate(buildCleanupExpression());
  }
}
