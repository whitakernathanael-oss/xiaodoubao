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

function workflowWith(injector: {
  apply: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
}): {
  workflow: SkinWorkflow;
  close: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
} {
  const close = vi.fn();
  const evaluate = vi.fn(async () => ({ counts: { "#root": 1, main: 1 } }));
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
    connect: vi.fn(async () => ({
      evaluate,
      close
    })),
    createInjector: vi.fn(() => injector as never),
    log: { write: vi.fn(async () => undefined) }
  });
  return { workflow, close, evaluate };
}

describe("skin workflow", () => {
  it("reports applied only after the injected page verifies", async () => {
    const injector = {
      apply: vi.fn(async () => ({ status: "compatible", missingRequired: [], missingOptional: [] })),
      verify: vi.fn(async () => true),
      restore: vi.fn(async () => undefined)
    };
    const { workflow } = workflowWith(injector);

    await expect(workflow.apply(DEFAULT_THEME.id, 9225)).resolves.toEqual({ kind: "applied" });
    expect(injector.verify).toHaveBeenCalledOnce();
    expect(injector.restore).not.toHaveBeenCalled();
  });

  it("restores and reports error when injected-page verification fails", async () => {
    const injector = {
      apply: vi.fn(async () => ({ status: "compatible", missingRequired: [], missingOptional: [] })),
      verify: vi.fn(async () => false),
      restore: vi.fn(async () => undefined)
    };
    const { workflow, close } = workflowWith(injector);

    await expect(workflow.apply(DEFAULT_THEME.id, 9225)).resolves.toEqual({ kind: "error" });
    expect(injector.restore).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses the injector result instead of probing selectors twice", async () => {
    const injector = {
      apply: vi.fn(async () => ({
        status: "incompatible",
        missingRequired: ["chatArea"],
        missingOptional: []
      })),
      verify: vi.fn(async () => true),
      restore: vi.fn(async () => undefined)
    };
    const { workflow, evaluate } = workflowWith(injector);

    await expect(workflow.apply(DEFAULT_THEME.id, 9225)).resolves.toEqual({ kind: "incompatible" });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("rolls back an earlier target when a later target fails verification", async () => {
    const first = {
      apply: vi.fn(async () => ({ status: "compatible", missingRequired: [], missingOptional: [] })),
      verify: vi.fn(async () => true),
      restore: vi.fn(async () => undefined)
    };
    const second = {
      apply: vi.fn(async () => ({ status: "compatible", missingRequired: [], missingOptional: [] })),
      verify: vi.fn(async () => false),
      restore: vi.fn(async () => undefined)
    };
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const injectors = [first, second];
    const sessions = [closeFirst, closeSecond];
    const workflow = new SkinWorkflow({
      loadBundle: vi.fn(async () => ({
        theme: DEFAULT_THEME,
        asset: { name: "wallpaper.png", bytes: Uint8Array.of(1) },
        readOnly: true
      })),
      loadAdapter: vi.fn(async () => adapter),
      fetchTargets: vi.fn(async () => [
        { id: "first", type: "page", title: "豆包", url: "doubao://doubao-chat/chat", webSocketDebuggerUrl: "ws://first" },
        { id: "second", type: "page", title: "豆包", url: "doubao://doubao-chat/chat", webSocketDebuggerUrl: "ws://second" }
      ]),
      connect: vi.fn(async () => ({
        evaluate: vi.fn(async () => ({ counts: { "#root": 1, main: 1 } })),
        close: sessions.shift()!
      })),
      createInjector: vi.fn(() => injectors.shift() as never),
      log: { write: vi.fn(async () => undefined) }
    });

    await expect(workflow.apply(DEFAULT_THEME.id, 9225)).resolves.toEqual({ kind: "error" });
    expect(first.restore).toHaveBeenCalledOnce();
    expect(second.restore).toHaveBeenCalledOnce();
    expect(closeFirst).toHaveBeenCalledOnce();
    expect(closeSecond).toHaveBeenCalledOnce();
  });

  it("restores only the active matching theme after cancelled guardian work", async () => {
    const injector = {
      apply: vi.fn(async () => ({ status: "compatible", missingRequired: [], missingOptional: [] })),
      verify: vi.fn(async () => true),
      restore: vi.fn(async () => undefined)
    };
    const { workflow, close } = workflowWith(injector);

    await workflow.apply(DEFAULT_THEME.id, 9225);
    await workflow.restoreThemeIfActive(DEFAULT_THEME.id);

    expect(injector.restore).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
