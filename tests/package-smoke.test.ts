import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../forge.config";
import rendererConfig from "../vite.renderer.config";

describe("Windows package metadata", () => {
  afterEach(() => {
    delete process.env.DOUBAO_ELECTRON_ZIP_DIR;
    vi.resetModules();
  });

  it("packages the product, icon, themes, and adapter for x64", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.productName).toBe("小豆包");
    expect(packageJson.author).toBeTruthy();
    expect(packageJson.scripts.make).toContain("--arch=x64");
    expect(packageJson.scripts["release:win"]).toBe("npm run typecheck && npm test && node tools/release-win.cjs");
    expect(packageJson.devDependencies.electron).toBe("43.3.0");

    const packager = config.packagerConfig as {
      name?: string; executableName?: string; icon?: string; extraResource?: string[];
      download?: { checksums?: Record<string, string> };
    };
    expect(packager.name).toBe("doubao-autoskin");
    expect(packager.executableName).toBe("小豆包");
    expect(packager.icon).toContain("assets/icon");
    expect(packager.extraResource).toEqual(expect.arrayContaining(["assets/themes", "assets/adapters"]));
    expect(packager.download?.checksums).toEqual({
      "electron-v43.3.0-win32-x64.zip": "18528bedc6a9b04bdc5efb7b803cbc3cb0e5ea6415d54046e23d464d89a00da9"
    });
    const icon = await readFile(path.join(process.cwd(), "assets", "icon.ico"));
    expect((await stat(path.join(process.cwd(), "assets", "icon.ico"))).size).toBe(76252);
    expect(Array.from(icon.subarray(0, 4))).toEqual([0, 0, 1, 0]);
    expect(createHash("sha256").update(icon).digest("hex")).toBe("6d04fdbdb198042c61b6d0da5eac370906d3ec8177fc17a387a8805945be926d");
    const forgeSource = await readFile(path.join(process.cwd(), "forge.config.ts"), "utf8");
    expect(forgeSource).toContain('name: "doubao_autoskin"');
    expect(forgeSource).toContain('setupExe: "小豆包-Setup.exe"');
  });

  it("uses 小豆包 for visible branding while retaining internal identifiers", async () => {
    const main = await readFile(path.join(process.cwd(), "src", "main.ts"), "utf8");
    const renderer = await readFile(path.join(process.cwd(), "src", "renderer", "app.ts"), "utf8");
    const html = await readFile(path.join(process.cwd(), "src", "renderer", "index.html"), "utf8");
    const defaults = await readFile(path.join(process.cwd(), "src", "shared", "defaults.ts"), "utf8");
    expect(main).toContain('icon: path.join(app.getAppPath(), "assets", "icon.ico")');
    expect(main).toContain('title: "小豆包"');
    expect(main).toContain('title: "退出小豆包"');
    expect(main).toContain('dialog.showErrorBox("小豆包启动失败"');
    expect(main).toContain("豆包皮肤版.exe");
    expect(main).toContain("小豆包.exe");
    expect(main).toContain('["--removeShortcut", "豆包皮肤版.exe"]');
    expect(main).toContain('["--createShortcut", "小豆包.exe"]');
    expect(main).toContain('["--removeShortcut", "小豆包.exe"], ["--removeShortcut", "豆包皮肤版.exe"]');
    expect(renderer).toContain("<b>小豆包</b>");
    expect(renderer).toContain("<small>小豆包</small>");
    expect(html).toContain("<title>小豆包</title>");
    expect(defaults).toContain('author: "小豆包"');
    for (const theme of ["clean-light", "glass-blue", "midnight-ink"]) {
      const bundled = JSON.parse(await readFile(path.join(process.cwd(), "assets", "themes", theme, "theme.json"), "utf8"));
      expect(bundled.author).toBe("小豆包");
    }
  });

  it("wires visible shortcut migration", async () => {
    const main = await readFile(path.join(process.cwd(), "src", "main.ts"), "utf8");
    const helper = await readFile(path.join(process.cwd(), "src", "main", "shortcut-migration.ts"), "utf8");
    expect(main).toContain("migrateShortcuts");
    expect(helper).toContain("doubao-autoskin.lnk");
    expect(helper).toContain("豆包皮肤版.lnk");
    expect(helper).toContain("小豆包.lnk");
  });

  it("does not import development inventory code into production", async () => {
    const productionFiles = [
      "src/main.ts", "src/preload.ts", "src/main/app-services.ts", "src/main/workflow.ts"
    ];
    for (const file of productionFiles) {
      expect(await readFile(path.join(process.cwd(), file), "utf8")).not.toContain("inspect-doubao");
    }
  });

  it("wires skin background coordination into the application runtime", async () => {
    const source = await readFile(path.join(process.cwd(), "src", "main", "app-services.ts"), "utf8");
    const helper = await readFile(path.join(process.cwd(), "src", "main", "guardian-takeover-log.ts"), "utf8");
    expect(source).toContain('from "./skin-background"');
    expect(source).toContain("reconcileSkinAutomationState(");
    const guardianBinding = source.slice(source.indexOf("const guardian = new SkinGuardian({"), source.indexOf("const manageStartup", source.indexOf("const guardian = new SkinGuardian({")));
    expect(guardianBinding).toContain("reportError:");
    expect(guardianBinding).toContain("guardianTakeoverFailure(error)");
    expect(helper).toContain('stage: "guardian-takeover"');
    expect(helper).toContain('errorType: error instanceof Error ? error.name : "unknown"');
    expect(helper).toContain('status: "failed"');
    expect(guardianBinding).not.toContain("targetUrl");
    expect(guardianBinding).not.toContain("themeId");
    expect(guardianBinding).not.toContain("doubaoExecutable");
  });

  it("disables the heavyweight GPU process before Electron becomes ready", async () => {
    const source = await readFile(path.join(process.cwd(), "src", "main.ts"), "utf8");
    expect(source.indexOf("app.disableHardwareAcceleration()"))
      .toBeGreaterThan(-1);
    expect(source.indexOf("app.disableHardwareAcceleration()"))
      .toBeLessThan(source.indexOf("app.whenReady()"));
  });

  it("supports a windowless guardian startup mode", async () => {
    const source = await readFile(path.join(process.cwd(), "src", "main.ts"), "utf8");
    expect(source).toContain("--skin-guardian");
    expect(source).toContain("startGuardian");
    expect(source).toContain("if (!await runtime.startGuardian()) app.quit();");
    const services = await readFile(path.join(process.cwd(), "src", "main", "app-services.ts"), "utf8");
    expect(services).toContain("startGuardian(): Promise<boolean>");
    expect(services).toContain("shouldKeepSkinBackground(settings.skinPersistenceEnabled, persistenceActive, settings.skinTemporarilyDisabled)");
  });

  it("keeps all three editor columns usable on high-DPI displays", async () => {
    const mainSource = await readFile(path.join(process.cwd(), "src", "main.ts"), "utf8");
    const styles = await readFile(path.join(process.cwd(), "src", "renderer", "styles.css"), "utf8");
    expect(mainSource).toContain("minWidth: 760");
    expect(mainSource).toContain("minHeight: 560");
    expect(styles).not.toContain("min-width: 960px");
    expect(styles).toContain("grid-template-columns: 160px minmax(300px,1fr) 220px");
    expect(styles).toContain("min-height: 280px");
  });

  it("serves the renderer from its actual HTML directory", () => {
    expect(rendererConfig.root).toBe("src/renderer");
    expect(rendererConfig.build?.outDir).toBe(path.resolve(process.cwd(), ".vite", "renderer", "main_window"));
  });

  it("can use a verified local Electron ZIP directory for offline builds", async () => {
    process.env.DOUBAO_ELECTRON_ZIP_DIR = "C:\\electron-cache";
    vi.resetModules();
    const { default: offlineConfig } = await import("../forge.config");
    expect((offlineConfig.packagerConfig as { electronZipDir?: string }).electronZipDir)
      .toBe("C:\\electron-cache");
  });
});
