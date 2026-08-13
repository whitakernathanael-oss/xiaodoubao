import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AdapterStore,
  isAllowedTarget,
  probePage,
  validateAdapter
} from "../src/main/adapter-store";
import type { DoubaoAdapter } from "../src/shared/contracts";

const adapter: DoubaoAdapter = {
  adapterVersion: 1,
  targets: [{ kind: "main", urlPrefix: "doubao://doubao-chat/chat" }],
  regions: {
    appRoot: ["#root"],
    sidebar: ["[data-testid='sidebar']"],
    chatArea: ["main"],
    messageUser: [],
    messageAssistant: [],
    composer: ["textarea"],
    buttons: ["button"],
    settingsPanel: ["[role='dialog']"]
  },
  pageStates: {
    chat: { requiredRegions: ["appRoot", "chatArea"] },
    settings: { requiredRegions: ["appRoot", "settingsPanel"] }
  }
};

describe("Doubao adapter", () => {
  let root: string;
  let userPath: string;
  let packagedPath: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "doubao-adapter-"));
    userPath = path.join(root, "user.json");
    packagedPath = path.join(root, "packaged.json");
    await writeFile(packagedPath, JSON.stringify(adapter));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("allows only explicitly mapped Doubao targets", () => {
    expect(isAllowedTarget("doubao://doubao-chat/chat", adapter)).toBe(true);
    expect(isAllowedTarget("doubao://doubao-background/", adapter)).toBe(false);
    expect(isAllowedTarget("doubao://doubao-chat/cross-site-support/", adapter)).toBe(false);
    expect(isAllowedTarget("https://example.com/", adapter)).toBe(false);
  });

  it("fails a page probe when a required region is missing", () => {
    const probe = probePage((selector) => selector === "#root" ? 1 : 0, adapter, "chat");
    expect(probe.status).toBe("incompatible");
    expect(probe.missingRequired).toContain("chatArea");
    expect(probe.matches.appRoot?.selector).toBe("#root");
  });

  it("loads the user adapter without merging when it exists", async () => {
    const custom = structuredClone(adapter);
    custom.regions.appRoot = ["#custom-root"];
    await writeFile(userPath, JSON.stringify(custom));

    const loaded = await new AdapterStore(userPath, packagedPath).load();

    expect(loaded.regions.appRoot).toEqual(["#custom-root"]);
  });

  it("ships the measured Doubao 2.22.7 selectors and still fails closed if roots disappear", async () => {
    const packaged = path.join(process.cwd(), "assets", "adapters", "doubao-adapter.json");
    const loaded = await new AdapterStore(userPath, packaged).load();
    expect(loaded.regions).toMatchObject({
      appRoot: ["#root"],
      sidebar: ['[data-testid="flow_chat_sidebar"]'],
      chatArea: ['main[data-container-name="main"]'],
      messageUser: ['[data-testid="send_message"]'],
      messageAssistant: ['[data-testid="receive_message"] [data-testid="message_text_content"]'],
      composer: ["#input-engine-container"],
      buttons: ['button[data-dbx-name="button"]'],
      settingsPanel: ['[role="dialog"][data-slot="dialog-content"]']
    });

    const observed = new Set([
      loaded.regions.appRoot[0], loaded.regions.sidebar[0], loaded.regions.chatArea[0],
      loaded.regions.messageUser[0], loaded.regions.messageAssistant[0], loaded.regions.composer[0],
      loaded.regions.buttons[0]
    ]);
    const compatible = probePage((selector) => observed.has(selector) ? 1 : 0, loaded, "chat");
    expect(compatible.missingRequired).toEqual([]);

    const absent = probePage(() => 0, loaded, "chat");
    expect(absent.status).toBe("incompatible");
    expect(absent.missingRequired).toEqual(["appRoot", "chatArea"]);
  });

  it("does not fall back to the packaged adapter when a user adapter is invalid", async () => {
    await writeFile(userPath, JSON.stringify({ ...adapter, adapterVersion: 2 }));
    await expect(new AdapterStore(userPath, packagedPath).load()).rejects.toThrow(/adapter/i);
  });

  it("rejects unknown region keys", () => {
    const result = validateAdapter({
      ...adapter,
      regions: { ...adapter.regions, unknownPanel: ["body"] }
    });
    expect(result.ok).toBe(false);
  });
});
