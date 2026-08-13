import { readdir, rename, unlink, lstat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

export interface ShortcutMigrationFs {
  readdir: (directory: string, options: { withFileTypes: true }) => Promise<Dirent[]>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  unlink: (file: string) => Promise<void>;
  lstat: (file: string) => Promise<unknown>;
}

export interface ShortcutMigrationOptions {
  desktop?: string;
  startMenu?: string;
  fs?: ShortcutMigrationFs;
}

const defaultFs: ShortcutMigrationFs = { readdir, rename, unlink, lstat };
const oldNames = ["doubao-autoskin.lnk", "豆包皮肤版.lnk"];
const newName = "小豆包.lnk";

async function migrateDirectory(directory: string, fs: ShortcutMigrationFs): Promise<void> {
  for (const oldName of oldNames) {
    const oldPath = path.join(directory, oldName);
    const newPath = path.join(directory, newName);
    try {
      await fs.lstat(oldPath);
    } catch {
      continue;
    }
    try {
      await fs.lstat(newPath);
      await fs.unlink(oldPath);
    } catch {
      try { await fs.rename(oldPath, newPath); } catch { /* best effort */ }
    }
  }
}

async function directoriesToMigrate(root: string, includeNested: boolean, fs: ShortcutMigrationFs): Promise<string[]> {
  const directories = [root];
  if (!includeNested) return directories;
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) if (entry.isDirectory()) directories.push(path.join(root, entry.name));
  } catch { /* missing roots and inaccessible folders are harmless */ }
  return directories;
}

/** Best-effort migration of visible shortcuts from previous releases. */
export async function migrateShortcuts(options: ShortcutMigrationOptions): Promise<void> {
  const fs = options.fs ?? defaultFs;
  const roots: Array<[string | undefined, boolean]> = [[options.desktop, false], [options.startMenu, true]];
  for (const [root, includeNested] of roots) {
    if (!root) continue;
    for (const directory of await directoriesToMigrate(root, includeNested, fs)) await migrateDirectory(directory, fs);
  }
}

export const migrateShortcutNames = migrateShortcuts;
