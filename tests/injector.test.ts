// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildApplyExpression, buildCleanupExpression, buildVerifyExpression } from "../src/main/injector";
import type { DoubaoAdapter } from "../src/shared/contracts";
import { DEFAULT_THEME } from "../src/shared/defaults";

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

  it("keeps system text untouched while mounting wallpaper inside the chat area", async () => {
    document.body.innerHTML = `
      <div id="root"><aside>导航</aside><main><p class="user">用户消息</p><p class="assistant">助手消息</p><textarea></textarea><button>发送</button></main></div>
    `;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:wallpaper";
    URL.revokeObjectURL = () => undefined;
    try {
      const payload = buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "");
      const result = await new Function(`return ${payload}`)() as { status: string };
      const main = document.querySelector("main")!;
      const wallpaper = document.querySelector("#doubao-autoskin-wallpaper")!;
      const css = document.querySelector<HTMLStyleElement>("#doubao-autoskin-style")!.textContent!;

      expect(result.status).toBe("partial");
      expect(wallpaper.parentElement).toBe(main);
      expect(css).toContain("--dbs-contrast-base");
      expect(css).not.toMatch(/(?:^|[;{\n])\s*(?:color|fill|caret-color)\s*:/i);
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
