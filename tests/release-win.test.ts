import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { artifactPaths, forgeCommand, removeOldOutput } = require("../tools/release-win.cjs") as {
  artifactPaths(root: string): { setup: string; portable: string };
  forgeCommand(environment: NodeJS.ProcessEnv): { file: string; args: string[] };
  removeOldOutput(root: string): string;
};

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Windows release helper", () => {
  it("publishes release version metadata", async () => {
    const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8")) as {
      version: string;
    };
    const packageLock = JSON.parse(await readFile(path.resolve("package-lock.json"), "utf8")) as {
      version: string;
      packages: { "": { version: string; license?: string } };
    };

    expect(packageJson.version).toBe("0.1.17");
    expect(packageLock.version).toBe("0.1.17");
    expect(packageLock.packages[""].version).toBe("0.1.17");
    expect(packageLock.packages[""].license).toBe("MIT");
  });

  it("publishes the persistent-skin release version", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.version).toBe("0.1.17");
  });

  it("deletes only the project out directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "doubao-release-"));
    temporaryRoots.push(root);
    await mkdir(path.join(root, "out", "stale"), { recursive: true });
    await writeFile(path.join(root, "keep.txt"), "keep");

    expect(removeOldOutput(root)).toBe(path.join(root, "out"));
    await expect(stat(path.join(root, "out"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(root, "keep.txt"), "utf8")).toBe("keep");
  });

  it("resolves the Setup and portable executable paths", () => {
    expect(artifactPaths("C:\\project")).toEqual({
      setup: path.resolve("C:\\project", "out/make/squirrel.windows/x64/豆包皮肤版-Setup.exe"),
      portable: path.resolve("C:\\project", "out/doubao-autoskin-win32-x64/豆包皮肤版.exe")
    });
  });

  it("launches npm through the Windows command processor", () => {
    expect(forgeCommand({ ComSpec: "C:\\Windows\\System32\\cmd.exe" })).toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd run make"]
    });
  });
});
