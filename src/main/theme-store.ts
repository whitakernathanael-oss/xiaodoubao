import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateExtraCss } from "./css-validator";
import { inspectWallpaper } from "./wallpaper-validation";
import {
  validateTheme,
  type Theme,
  type ThemeSummary
} from "../shared/contracts";

export interface ThemeAsset {
  name: string;
  bytes: Uint8Array;
}

export interface ThemeBundle {
  theme: Theme;
  asset: ThemeAsset;
  extraCss?: string;
  readOnly: boolean;
}

function summary(theme: Theme, readOnly: boolean): ThemeSummary {
  return {
    id: theme.id,
    name: theme.name,
    author: theme.author,
    wallpaperFile: theme.wallpaper.file,
    surfaceColor: theme.palette.surface,
    accentColor: theme.palette.accent,
    readOnly
  };
}

function validateAsset(theme: Theme, asset: ThemeAsset): void {
  if (asset.name !== theme.wallpaper.file) throw new Error("Wallpaper asset name does not match theme");
  inspectWallpaper(asset.name, asset.bytes);
}

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

export class ThemeStore {
  constructor(
    private readonly userRoot: string,
    private readonly builtInRoot: string
  ) {}

  private async builtIn(id: string): Promise<boolean> {
    return exists(path.join(this.builtInRoot, id, "theme.json"));
  }

  async has(id: string): Promise<boolean> {
    return await exists(path.join(this.userRoot, id, "theme.json")) || await this.builtIn(id);
  }

  async nextAvailableId(id: string): Promise<string> {
    if (!await this.has(id)) return id;
    let suffix = 2;
    while (await this.has(`${id}-${suffix}`)) suffix += 1;
    return `${id}-${suffix}`;
  }

  private async readFrom(root: string, id: string): Promise<Theme> {
    const parsed: unknown = JSON.parse(await readFile(path.join(root, id, "theme.json"), "utf8"));
    const result = validateTheme(parsed);
    if (!result.ok) throw new Error(`Invalid theme: ${result.errors.join("; ")}`);
    if (result.theme.id !== id) throw new Error("Theme directory and id do not match");
    return result.theme;
  }

  private async entries(root: string, readOnly: boolean): Promise<ThemeSummary[]> {
    let names: string[];
    try {
      names = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.name.includes(".tmp-") && !entry.name.includes(".bak-"))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const themes: ThemeSummary[] = [];
    for (const id of names.sort()) {
      try { themes.push(summary(await this.readFrom(root, id), readOnly)); } catch { /* skip corrupt directories */ }
    }
    return themes;
  }

  async list(): Promise<ThemeSummary[]> {
    return [...await this.entries(this.builtInRoot, true), ...await this.entries(this.userRoot, false)];
  }

  async load(id: string): Promise<Theme> {
    if (await exists(path.join(this.userRoot, id, "theme.json"))) return this.readFrom(this.userRoot, id);
    return this.readFrom(this.builtInRoot, id);
  }

  async save(input: Theme, asset: ThemeAsset, extraCss?: string): Promise<ThemeSummary> {
    const result = validateTheme(input);
    if (!result.ok) throw new Error(`Invalid theme: ${result.errors.join("; ")}`);
    const theme = result.theme;
    if (await this.builtIn(theme.id)) throw new Error("Built-in themes are read-only");
    validateAsset(theme, asset);
    if (extraCss !== undefined) {
      const cssResult = validateExtraCss(extraCss, theme.id);
      if (!cssResult.ok) throw new Error(`Invalid extra.css: ${cssResult.errors.join("; ")}`);
    }
    await mkdir(this.userRoot, { recursive: true });

    const destination = path.join(this.userRoot, theme.id);
    const temporary = path.join(this.userRoot, `${theme.id}.tmp-${randomUUID()}`);
    const backup = path.join(this.userRoot, `${theme.id}.bak-${randomUUID()}`);
    let movedOld = false;
    try {
      await mkdir(temporary);
      await writeFile(path.join(temporary, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`);
      await writeFile(path.join(temporary, asset.name), asset.bytes);
      if (extraCss !== undefined) await writeFile(path.join(temporary, "extra.css"), extraCss, "utf8");
      if (await exists(destination)) {
        await rename(destination, backup);
        movedOld = true;
      }
      await rename(temporary, destination);
      if (movedOld) await rm(backup, { recursive: true, force: true });
      return summary(theme, false);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      if (movedOld && !await exists(destination)) await rename(backup, destination);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    if (await this.builtIn(id)) throw new Error("Built-in themes are read-only");
    await rm(path.join(this.userRoot, id), { recursive: true, force: true });
  }

  async duplicate(id: string): Promise<ThemeSummary> {
    const bundle = await this.readBundle(id);
    const copyId = await this.nextAvailableId(bundle.theme.id);
    const copy: Theme = { ...bundle.theme, id: copyId, name: `${bundle.theme.name} Copy` };
    const extraCss = bundle.extraCss?.split(`.theme-${bundle.theme.id}`).join(`.theme-${copyId}`);
    return this.save(copy, bundle.asset, extraCss);
  }

  async readBundle(id: string): Promise<ThemeBundle> {
    const inUserRoot = await exists(path.join(this.userRoot, id, "theme.json"));
    const root = inUserRoot ? this.userRoot : this.builtInRoot;
    const theme = await this.readFrom(root, id);
    const asset = {
      name: theme.wallpaper.file,
      bytes: await readFile(path.join(root, id, theme.wallpaper.file))
    };
    let extraCss: string | undefined;
    try {
      extraCss = await readFile(path.join(root, id, "extra.css"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return { theme, asset, extraCss, readOnly: !inUserRoot };
  }
}
