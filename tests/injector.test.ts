import { describe, expect, it } from "vitest";
import { buildApplyExpression, buildCleanupExpression } from "../src/main/injector";
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
});
