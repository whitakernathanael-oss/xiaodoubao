import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrivacyLog } from "../src/main/log";

describe("privacy-safe capped log", () => {
  let root: string;
  let file: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "doubao-log-"));
    file = path.join(root, "app.log");
  });
  afterEach(async () => rm(root, { recursive: true, force: true }));

  it("keeps only allowlisted diagnostic fields and newest bytes", async () => {
    const log = new PrivacyLog(file, 600, () => "2026-08-08T10:00:00.000Z");
    await log.write({
      stage: "probe", errorType: "MissingRegion", targetUrl: "doubao://doubao-chat/chat?secret=1",
      matchCounts: { appRoot: 1 }, conversation: "PRIVATE CONVERSATION" 
    } as never);
    for (let index = 0; index < 20; index += 1) {
      await log.write({ stage: `step-${index}`, matchCounts: { appRoot: index } });
    }
    const text = await log.read();
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(600);
    expect(text).toContain("step-19");
    expect(text).not.toContain("PRIVATE CONVERSATION");
    expect(text).not.toContain("secret=1");
  });
});
