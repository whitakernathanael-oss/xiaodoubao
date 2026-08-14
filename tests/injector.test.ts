// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildApplyExpression, buildCleanupExpression, buildVerifyExpression } from "../src/main/injector";
import type { DoubaoAdapter } from "../src/shared/contracts";
import { DEFAULT_THEME } from "../src/shared/defaults";

type Rgb = readonly [number, number, number];

function hexRgb(hex: string): Rgb {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as unknown as Rgb;
}

function blend(background: Rgb, foreground: Rgb, opacity: number): Rgb {
  return background.map((channel, index) => channel * (1 - opacity) + foreground[index] * opacity) as unknown as Rgb;
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (rgb: Rgb) => channel(rgb[0]) * 0.2126 + channel(rgb[1]) * 0.7152 + channel(rgb[2]) * 0.0722;
  const bright = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (bright + 0.05) / (dark + 0.05);
}

const adapter: DoubaoAdapter = {
  adapterVersion: 1,
  targets: [{ kind: "main", urlPrefix: "doubao://doubao-chat/chat" }],
  regions: {
    appRoot: ["#root"], sidebar: ["aside"], chatArea: ["main"], messageUser: [".user"],
    messageAssistant: [".assistant"], composer: ["textarea"], buttons: ["button"], settingsPanel: [".settings"]
  },
  pageStates: {
    chat: { requiredRegions: ["appRoot", "chatArea"] },
    settings: { requiredRegions: ["appRoot", "settingsPanel"] }
  }
};

describe("theme injection payloads", () => {
  it("builds an executable application payload", () => {
    const payload = buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "");
    expect(() => new Function(`return ${payload}`)).not.toThrow();
  });

  it("rejects a non-image Data URL", () => {
    expect(() => buildApplyExpression(DEFAULT_THEME, adapter, "https://example.com/x.png", "")).toThrow(
      /Data URL/i
    );
  });

  it("removes the applied wallpaper, styles, and theme markers", async () => {
    document.body.innerHTML = '<div id="root"><main>聊天</main></div>';
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      await new Function(`return ${buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "")}`)();
      expect(await new Function(`return ${buildCleanupExpression()}`)()).toBe(true);
      expect(document.querySelector("#doubao-autoskin-style")).toBeNull();
      expect(document.querySelector("#doubao-autoskin-wallpaper")).toBeNull();
      expect(document.documentElement.classList.contains("doubao-skin")).toBe(false);
      expect(document.querySelector(".dbs-chat-area")).toBeNull();
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("cancels a pending DOM rematch when the official appearance is restored", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"><main>聊天</main></div>';
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      await new Function(`return ${buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "")}`)();
      document.querySelector("#root")!.append(document.createElement("span"));
      await Promise.resolve();

      await new Function(`return ${buildCleanupExpression()}`)();
      await vi.advanceTimersByTimeAsync(100);

      expect(document.querySelector("[class*='dbs-']")).toBeNull();
    } finally {
      vi.useRealTimers();
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("keeps system text untouched while mounting wallpaper behind the app root and glass sidebar", async () => {
    document.body.innerHTML = `
      <div id="root"><aside>导航</aside><main><p class="user">用户消息</p><p class="assistant">助手消息</p><textarea></textarea><button>发送</button></main></div>
    `;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      const theme = structuredClone(DEFAULT_THEME);
      theme.regions.sidebar.opacity = 0.72;
      const payload = buildApplyExpression(theme, adapter, "data:image/png;base64,AA==", "");
      const result = await new Function(`return ${payload}`)() as { status: string };
      const root = document.querySelector("#root")!;
      const wallpaper = document.querySelector("#doubao-autoskin-wallpaper")!;
      const css = document.querySelector<HTMLStyleElement>("#doubao-autoskin-style")!.textContent!;

      expect(result.status).toBe("partial");
      expect(wallpaper.parentElement).toBe(root);
      expect(document.documentElement.style.getPropertyValue("--dbs-sidebar-alpha")).toBe("72%");
      expect(css).toContain("--dbs-contrast-base");
      expect(css).toContain("backdrop-filter: blur(");
      expect(css).toContain("var(--dbs-sidebar-glass-base) var(--dbs-sidebar-alpha), transparent");
      expect(css).toContain('[data-testid="sidebar-section-item"] { background: transparent !important;');
      expect(css).not.toMatch(/(?:^|[;{\n])\s*(?:color|fill|caret-color)\s*:/i);
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("keeps fixed application-root children out of the wallpaper stacking rule", async () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="chat-route-layout">
          <div id="chat-route-main"><aside>导航</aside><main>聊天</main></div>
        </div>
        <div id="fixed-layer" style="position: fixed">浮层</div>
      </div>
    `;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      await new Function(`return ${buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "")}`)();
      const wallpaper = document.querySelector<HTMLElement>("#doubao-autoskin-wallpaper")!;
      const contentLayer = document.querySelector<HTMLElement>("#chat-route-layout")!;
      const contentSurface = document.querySelector<HTMLElement>("#chat-route-main")!;
      const fixed = document.querySelector<HTMLElement>("#fixed-layer")!;
      const css = document.querySelector<HTMLStyleElement>("#doubao-autoskin-style")!.textContent!;

      expect(wallpaper.style.zIndex).toBe("0");
      expect(contentLayer.classList.contains("dbs-content-layer")).toBe(true);
      expect(contentSurface.classList.contains("dbs-content-surface")).toBe(true);
      expect(fixed.classList.contains("dbs-content-layer")).toBe(false);
      expect(getComputedStyle(fixed).position).toBe("fixed");
      expect(css).toContain("html.doubao-skin .dbs-content-layer");
      expect(css).toContain("html.doubao-skin .dbs-content-surface");
      expect(css).toContain("z-index: 0 !important");
      expect(css).toContain("background: transparent !important");
      expect(css).not.toContain('.dbs-wallpaper-host > :not(#doubao-autoskin-wallpaper)');
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it.each([
    { foreground: [255, 255, 255] as Rgb, worstBackground: [255, 255, 255] as Rgb, sidebar: "#eeeeee" },
    { foreground: [0, 0, 0] as Rgb, worstBackground: [0, 0, 0] as Rgb, sidebar: "#161a22" }
  ])("keeps system foreground readable through cross-mode sidebar glass", async ({ foreground, worstBackground, sidebar }) => {
    document.body.innerHTML = `<div id="root"><aside>导航</aside><main style="color: rgb(${foreground.join(",")})">聊天</main></div>`;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      const theme = structuredClone(DEFAULT_THEME);
      theme.regions.sidebar.backgroundColor = sidebar;
      theme.regions.sidebar.opacity = 0.72;
      await new Function(`return ${buildApplyExpression(theme, adapter, "data:image/png;base64,AA==", "")}`)();

      const glassBase = hexRgb(document.documentElement.style.getPropertyValue("--dbs-sidebar-glass-base"));
      const finalSurface = blend(worstBackground, glassBase, 0.72);

      expect(contrastRatio(foreground, finalSurface)).toBeGreaterThanOrEqual(4.5);
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it.each(["rgb(79, 124, 255)", "rgba(79, 124, 255, 0.6)"])(
    "uses a theme-tinted safety base for %s when Doubao supplies light system text",
    async (accent) => {
    document.body.innerHTML = '<div id="root"><main style="color: rgb(255, 255, 255)">聊天</main></div>';
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      const theme = { ...DEFAULT_THEME, palette: { ...DEFAULT_THEME.palette, accent } };
      await new Function(`return ${buildApplyExpression(theme, adapter, "data:image/png;base64,AA==", "")}`)();

      const safetyBase = document.documentElement.style.getPropertyValue("--dbs-contrast-base");
      expect(safetyBase).toMatch(/^#[0-9a-f]{6}$/);
      expect(safetyBase).not.toBe("#000000");
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("clamps a very light accent so white system text keeps readable contrast", async () => {
    document.body.innerHTML = '<div id="root"><main style="color: rgb(255, 255, 255)">聊天</main></div>';
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      const theme = { ...DEFAULT_THEME, palette: { ...DEFAULT_THEME.palette, accent: "#ffffff" } };
      await new Function(`return ${buildApplyExpression(theme, adapter, "data:image/png;base64,AA==", "")}`)();
      const base = document.documentElement.style.getPropertyValue("--dbs-contrast-base");
      const baseChannels = [1, 3, 5].map((index) => Number.parseInt(base.slice(index, index + 2), 16));
      const worstSurface = baseChannels.map((channel) => Math.round(channel * 0.6 + 255 * 0.4));
      const linear = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const luminance = linear(worstSurface[0]) * 0.2126
        + linear(worstSurface[1]) * 0.7152 + linear(worstSurface[2]) * 0.0722;

      expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("does not paint generic or empty Doubao buttons and includes the composer shell", async () => {
    const runtimeAdapter: DoubaoAdapter = {
      ...adapter,
      regions: { ...adapter.regions, composer: ["#input-engine-container"] }
    };
    document.body.innerHTML = `
      <div id="root">
        <aside><button aria-label="新对话">新对话</button><button>历史对话</button></aside>
        <main>
          <section id="composer-shell"><div id="input-engine-container"><textarea></textarea><button id="empty-placeholder" aria-label="占位"></button></div></section>
        </main>
      </div>
    `;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      await new Function(`return ${buildApplyExpression(DEFAULT_THEME, runtimeAdapter, "data:image/png;base64,AA==", "")}`)();
      const css = document.querySelector<HTMLStyleElement>("#doubao-autoskin-style")!.textContent!;

      expect(document.querySelector("#empty-placeholder")!.classList.contains("dbs-button")).toBe(false);
      expect(document.querySelector("#composer-shell")!.classList.contains("dbs-composer-surface")).toBe(true);
      expect(css).not.toContain(".dbs-sidebar .dbs-button { background: transparent !important;");
      expect(css).toContain('[data-state="active"]');
      expect(css).not.toMatch(/html\.doubao-skin \.dbs-button \{[^}]*background(?:-color)?\s*:/);
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("overrides the current Doubao dark navigation, composer, and greeting surfaces", async () => {
    const runtimeAdapter: DoubaoAdapter = {
      ...adapter,
      regions: { ...adapter.regions, composer: ["#input-engine-container"] }
    };
    document.body.innerHTML = `
      <div id="root">
        <aside>
          <div data-testid="create_conversation_button"><div class="!bg-dbx-bg-float">新对话</div></div>
          <div data-testid="sidebar-section-item">历史对话</div>
        </aside>
        <main>
          <div id="flow-chat-guidance-page"><div class="greeting-text-Q0pGud">问候</div></div>
          <section><div id="input-engine-container"><div class="native-composer-surface"><textarea></textarea></div><div class="attachment-surface">附件</div></div></section>
        </main>
      </div>
    `;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      await new Function(`return ${buildApplyExpression(DEFAULT_THEME, runtimeAdapter, "data:image/png;base64,AA==", "")}`)();
      const css = document.querySelector<HTMLStyleElement>("#doubao-autoskin-style")!.textContent!;

      expect(css).toContain('[class~="!bg-dbx-bg-float"]');
      expect(css).toContain('[data-testid="sidebar-section-item"]');
      expect(css).toContain('[data-testid="sidebar-section-item"]:is(:hover, :focus-within)');
      expect(css).toContain('.dbs-composer > :has(textarea, [contenteditable="true"]) { background: transparent !important;');
      expect(css).not.toContain('.dbs-composer > * { background: transparent !important;');
      expect(css).toContain('[class*="greeting-text-"]::after');
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("leaves user messages unpainted while restoring native assistant messages", async () => {
    document.body.innerHTML = '<div id="root"><aside></aside><main>聊天</main></div>';
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      await new Function(`return ${buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "")}`)();
      const css = document.querySelector<HTMLStyleElement>("#doubao-autoskin-style")!.textContent!;

      expect(css.match(/\.dbs-message-user\b/g) ?? []).toHaveLength(0);
      expect(css).toMatch(/\.dbs-message-assistant \{ background: transparent !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; padding-inline: 0 !important;/);
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("targets the outer send_message element for user bubbles", async () => {
    const shippedAdapter = JSON.parse(readFileSync(path.resolve("assets/adapters/doubao-adapter.json"), "utf8")) as DoubaoAdapter;
    expect(shippedAdapter.regions.messageUser).toEqual(['[data-testid="send_message"]']);
    const runtimeAdapter = { ...adapter, regions: { ...adapter.regions, messageUser: ['[data-testid="send_message"]'] } };
    document.body.innerHTML = '<div id="root"><aside></aside><main><div data-testid="send_message"><span data-testid="message_text_content">用户消息</span></div></main></div>';
    const originalCreateObjectUrl = URL.createObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    try {
      await new Function(`return ${buildApplyExpression(DEFAULT_THEME, runtimeAdapter, "data:image/png;base64,AA==", "")}`)();
      expect(document.querySelector('[data-testid="send_message"]')!.classList.contains("dbs-message-user")).toBe(true);
      expect(document.querySelector('[data-testid="message_text_content"]')!.classList.contains("dbs-message-user")).toBe(false);
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("overrides populated conversation code surfaces and the dark composer fade", async () => {
    document.body.innerHTML = `
      <div id="root">
        <aside></aside>
        <main>
          <div data-testid="message-list"></div>
          <div id="conversation-fade" class="h-full from-s-color-bg-body to-transparent"></div>
          <div id="conversation-code-container" class="custom-code-block-container">
            <div id="conversation-code-area" class="code-area">
              <div id="conversation-code-header" data-copy-ignore="true"><div class="header-live"><button id="copy-button">复制</button></div></div>
              <div id="conversation-code-content" class="code-content"></div>
            </div>
          </div>
          <div id="unrelated-code-area" class="code-area"><div class="code-content"></div></div>
        </main>
      </div>
      <section id="new-chat" class="dbs-chat-area">
        <div id="new-chat-fade" class="from-s-color-bg-body to-transparent"></div>
        <div class="custom-code-block-container"><div class="code-area"><div class="code-content"></div></div></div>
      </section>
    `;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      await new Function(`return ${buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "")}`)();
      const css = document.querySelector<HTMLStyleElement>("#doubao-autoskin-style")!.textContent!;

      const conversationFadeSelector = '.dbs-chat-area:has([data-testid="message-list"]) [class~="from-s-color-bg-body"][class~="to-transparent"]';
      const codeContainerSelector = '.dbs-chat-area:has([data-testid="message-list"]) .custom-code-block-container';
      const codeAreaSelector = `${codeContainerSelector} .code-area`;
      const conversationCodeSelector = '.dbs-chat-area:has([data-testid="message-list"]) .custom-code-block-container .code-area .code-content';
      const headerWrapperSelector = `${codeAreaSelector} > [data-copy-ignore="true"]`;
      const headerSurfaceSelector = '.dbs-chat-area:has([data-testid="message-list"]) .custom-code-block-container .code-area > [data-copy-ignore="true"] > [class^="header-"]';

      expect(css).toContain(`${conversationFadeSelector} { background-image: none !important;`);
      expect(css).toContain(`${codeContainerSelector} { border-color:`);
      expect(css).toContain(`${codeAreaSelector},`);
      expect(css).toContain(conversationCodeSelector);
      expect(css).toContain(`${headerWrapperSelector},`);
      expect(css).toContain(headerSurfaceSelector);
      expect([...document.querySelectorAll(conversationFadeSelector)].map((element) => element.id)).toEqual(["conversation-fade"]);
      expect([...document.querySelectorAll(codeContainerSelector)].map((element) => element.id)).toEqual(["conversation-code-container"]);
      expect([...document.querySelectorAll(codeAreaSelector)].map((element) => element.id)).toEqual(["conversation-code-area"]);
      expect([...document.querySelectorAll(conversationCodeSelector)].map((element) => element.id)).toEqual(["conversation-code-content"]);
      expect([...document.querySelectorAll(headerWrapperSelector)].map((element) => element.id)).toEqual(["conversation-code-header"]);
      expect([...document.querySelectorAll(headerSurfaceSelector)].map((element) => element.className)).toEqual(["header-live"]);
      expect(document.querySelector("#new-chat-fade")!.matches(conversationFadeSelector)).toBe(false);
      expect(document.querySelector("#unrelated-code-area .code-content")!.matches(conversationCodeSelector)).toBe(false);
      expect(document.querySelector("#copy-button")!.matches(headerSurfaceSelector)).toBe(false);
      expect(css).not.toContain('[data-copy-ignore="true"] > *');
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("themes the transient conversation skeleton before adapter markers return", async () => {
    document.body.innerHTML = `
      <div id="root">
        <aside></aside>
        <main>
          <div id="loading-surface" class="container-live chrome70-container">
            <div class="inner-live"><div id="loading-line" class="h-36 skeleton-live"></div></div>
          </div>
          <div id="unrelated-skeleton" class="skeleton-live"></div>
        </main>
      </div>
    `;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      await new Function(`return ${buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "")}`)();
      const css = document.querySelector<HTMLStyleElement>("#doubao-autoskin-style")!.textContent!;
      document.documentElement.classList.remove("doubao-skin");
      const surfaceSelector = ".chrome70-container";
      const firstLineSelector = '.chrome70-container [class^="skeleton-"]';
      const laterLineSelector = '.chrome70-container [class*=" skeleton-"]';

      expect(css).toContain(`${surfaceSelector} { background-color: transparent !important;`);
      expect(css).toContain(firstLineSelector);
      expect(css).toContain(laterLineSelector);
      expect(css).toContain("color-mix(in srgb, currentColor 10%, transparent)");
      expect(document.querySelector("#loading-surface")!.matches(surfaceSelector)).toBe(true);
      expect(document.querySelector("#loading-line")!.matches(laterLineSelector)).toBe(true);
      expect(document.querySelector("#unrelated-skeleton")!.matches(`${firstLineSelector}, ${laterLineSelector}`)).toBe(false);
      expect(css).not.toContain("html.doubao-skin .chrome70-container");
      expect(css).not.toContain(".chrome70-container *");
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("uses the adapted application root when a settings dialog has no chat area", async () => {
    document.body.innerHTML = '<div id="root"><div class="settings">设置</div></div>';
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      const payload = buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "");
      const result = await new Function(`return ${payload}`)() as { status: string };

      expect(result.status).toBe("partial");
      expect(document.querySelector("#doubao-autoskin-wallpaper")!.parentElement?.id).toBe("root");
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });

  it("verifies required semantic regions are still visible", async () => {
    document.body.innerHTML = '<div id="root"><main>聊天</main></div>';
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      const payload = buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "");
      await new Function(`return ${payload}`)();

      expect(await new Function(`return ${buildVerifyExpression(adapter)}`)()).toBe(true);
      document.querySelector<HTMLElement>("main")!.style.display = "none";
      expect(await new Function(`return ${buildVerifyExpression(adapter)}`)()).toBe(false);
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.body.innerHTML = "";
    }
  });
});
