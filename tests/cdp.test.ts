import { describe, expect, it } from "vitest";
import { CdpSession, fetchTargets } from "../src/main/cdp";
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

describe("CDP target discovery", () => {
  it("uses IPv6 loopback when IPv4 fails and filters auxiliary targets", async () => {
    const fakeFetch = async (url: string) => {
      if (url.includes("127.0.0.1")) throw new Error("IPv4 unavailable");
      return {
        ok: true,
        json: async () => [
          { id: "chat", type: "page", title: "豆包", url: "doubao://doubao-chat/chat", webSocketDebuggerUrl: "ws://[::1]:9225/devtools/page/chat" },
          { id: "bg", type: "page", title: "background", url: "doubao://doubao-background/", webSocketDebuggerUrl: "ws://[::1]:9225/devtools/page/bg" },
          { id: "support", type: "other", title: "support", url: "doubao://doubao-chat/cross-site-support/", webSocketDebuggerUrl: "ws://[::1]:9225/devtools/page/support" }
        ]
      };
    };

    const targets = await fetchTargets(9225, adapter, fakeFetch);

    expect(targets.map((target) => target.id)).toEqual(["chat"]);
  });

  it("rejects invalid ports before making a request", async () => {
    await expect(fetchTargets(0, adapter, async () => { throw new Error("should not run"); })).rejects.toThrow(
      /port/i
    );
  });

  it("correlates command responses by numeric request id", async () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    const sent: Array<{ id: number; method: string }> = [];
    const socket = {
      readyState: 1,
      addEventListener(type: string, listener: (event: Event) => void) {
        const group = listeners.get(type) ?? new Set();
        group.add(listener);
        listeners.set(type, group);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      },
      send(data: string) { sent.push(JSON.parse(data)); },
      close() {}
    };
    const session = new CdpSession(socket);
    const pending = session.command("Runtime.enable");
    const request = sent[0];
    for (const listener of listeners.get("message") ?? []) {
      listener({ data: JSON.stringify({ id: request.id, result: { enabled: true } }) } as MessageEvent);
    }
    await expect(pending).resolves.toEqual({ enabled: true });
  });
});
