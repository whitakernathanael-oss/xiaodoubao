import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkinStateStore } from "../src/main/skin-state";

describe("active skin state", () => {
  let root: string;
  let file: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "doubao-skin-state-"));
    file = path.join(root, "active-skin.json");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes and reloads an enabled active theme", async () => {
    const store = new SkinStateStore(file);
    await store.save({
      version: 1,
      themeId: "wallpaper-002",
      port: 9225,
      doubaoExecutable: "C:\\Apps\\Doubao.exe",
      updatedAt: "2026-08-10T00:00:00.000Z"
    });

    await expect(store.load()).resolves.toEqual({
      version: 1,
      themeId: "wallpaper-002",
      port: 9225,
      doubaoExecutable: "C:\\Apps\\Doubao.exe",
      updatedAt: "2026-08-10T00:00:00.000Z"
    });
    await expect(readFile(file, "utf8")).resolves.toContain("wallpaper-002");
  });

  it("returns no active skin after disable", async () => {
    const store = new SkinStateStore(file);
    await store.save({
      version: 1,
      themeId: "wallpaper-002",
      port: 9225,
      doubaoExecutable: "C:\\Apps\\Doubao.exe",
      updatedAt: "2026-08-10T00:00:00.000Z"
    });

    await store.disable();

    await expect(store.load()).resolves.toBeUndefined();
  });

  it("ignores malformed or unsafe persisted state", async () => {
    await writeFile(file, JSON.stringify({ version: 1, themeId: "../escape", port: 9225 }));

    await expect(new SkinStateStore(file).load()).resolves.toBeUndefined();
  });
});
