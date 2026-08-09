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
  it("builds an idempotent, scoped application payload", () => {
    const payload = buildApplyExpression(DEFAULT_THEME, adapter, "data:image/png;base64,AA==", "");
    expect(payload).toContain("doubao-autoskin-style");
    expect(payload).toContain("doubao-autoskin-wallpaper");
    expect(payload).toContain("__DOUBAO_SKIN_STATE__");
    expect(payload).toContain("pointer-events: none");
    expect(payload).toContain("MutationObserver");
    expect(payload).toContain("URL.createObjectURL");
    expect(payload).toContain("missingRequired");
    expect(payload).toContain("--dbs-sidebar-radius");
    expect(payload).toContain("--dbs-chat-shadow");
    expect(payload).toContain("--dbs-composer-focus");
    expect(payload).toContain("--dbs-button-radius");
    expect(payload).toContain("--dbs-wallpaper-overlay-opacity");
    expect(() => new Function(`return ${payload}`)).not.toThrow();
  });

  it("rejects a non-image Data URL", () => {
    expect(() => buildApplyExpression(DEFAULT_THEME, adapter, "https://example.com/x.png", "")).toThrow(
      /Data URL/i
    );
  });

  it("builds complete repeatable cleanup", () => {
    const cleanup = buildCleanupExpression();
    for (const token of [
      "doubao-autoskin-style",
      "doubao-autoskin-wallpaper",
      "doubao-skin",
      "theme-",
      "dbs-",
      "--dbs-",
      "disconnect",
      "URL.revokeObjectURL",
      "__DOUBAO_SKIN_STATE__"
    ]) {
      expect(cleanup).toContain(token);
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
