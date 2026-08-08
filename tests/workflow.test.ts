import { describe, expect, it, vi } from "vitest";
import { SkinWorkflow } from "../src/main/workflow";
import { DEFAULT_THEME } from "../src/shared/defaults";
import type { DoubaoAdapter } from "../src/shared/contracts";

const adapter: DoubaoAdapter = {
  adapterVersion: 1,
  targets: [{ kind: "main", urlPrefix: "doubao://doubao-chat/chat" }],
  regions: {
    appRoot: ["#root"], sidebar: [], chatArea: ["main"], messageUser: [],
    messageAssistant: [], composer: [], buttons: [], settingsPanel: []
  },
  pageStates: {
    chat: { requiredRegions: ["appRoot", "chatArea"] },
    settings: { requiredRegions: ["appRoot", "settingsPanel"] }
  }
};

describe("skin workflow", () => {
  it("does not create an injector when required selectors are missing", async () => {
    const close = vi.fn();
    const createInjector = vi.fn();
    const workflow = new SkinWorkflow({
      loadBundle: vi.fn(async () => ({
        theme: DEFAULT_THEME,
        asset: { name: "wallpaper.png", bytes: Uint8Array.of(1) },
        readOnly: true
      })),
      loadAdapter: vi.fn(async () => adapter),
      fetchTargets: vi.fn(async () => [{
        id: "chat", type: "page", title: "豆包", url: "doubao://doubao-chat/chat",
        webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/chat"
      }]),
      connect: vi.fn(async () => ({ evaluate: vi.fn(async () => ({ counts: { "#root": 1, main: 0 } })), close })),
      createInjector,
      log: { write: vi.fn(async () => undefined) }
    });

    await expect(workflow.apply(DEFAULT_THEME.id, 9225)).resolves.toEqual({ kind: "incompatible" });
    expect(createInjector).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
