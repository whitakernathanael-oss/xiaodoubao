import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installGuardianStartup, removeGuardianStartup, startupCommandPath } from "../src/main/startup-shortcut";

describe("guardian login startup command", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "doubao-skin-startup-"));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("writes a quoted current-user command for guardian mode", async () => {
    await installGuardianStartup("C:\\Program Files\\Doubao Skin\\豆包皮肤版.exe", folder);

    await expect(readFile(startupCommandPath(folder), "utf8")).resolves.toContain(
      'start "" "C:\\Program Files\\Doubao Skin\\豆包皮肤版.exe" --skin-guardian'
    );
  });

  it("removes only its own login startup command", async () => {
    await installGuardianStartup("C:\\Skin\\豆包皮肤版.exe", folder);
    await removeGuardianStartup(folder);

    await expect(readFile(startupCommandPath(folder), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
