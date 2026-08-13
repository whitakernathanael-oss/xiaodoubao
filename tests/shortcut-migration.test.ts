import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrateShortcuts, type ShortcutMigrationFs } from "../src/main/shortcut-migration";

function fakeFs(files: string[], dirs: string[] = []): ShortcutMigrationFs & { files: Set<string> } {
  const state = { files: new Set(files), dirs: new Set(dirs) };
  return {
    files: state.files,
    readdir: async () => [...state.dirs].map((entry) => ({ name: path.basename(entry), isDirectory: () => true } as never)),
    lstat: async (file) => { if (!state.files.has(file)) throw new Error("ENOENT"); return {}; },
    copyFile: async (from, to, flags) => { if (!state.files.has(from)) throw new Error("ENOENT"); if (flags && state.files.has(to)) { const error = new Error("EEXIST") as NodeJS.ErrnoException; error.code = "EEXIST"; throw error; } state.files.add(to); },
    unlink: async (file) => { if (!state.files.delete(file)) throw new Error("ENOENT"); }
  };
}

describe("shortcut migration", () => {
  it.each(["doubao-autoskin.lnk", "豆包皮肤版.lnk"])("renames %s on Desktop", async (oldName) => {
    const desktop = "C:/Desktop";
    const fs = fakeFs([path.join(desktop, oldName)]);
    await migrateShortcuts({ desktop, fs });
    expect(fs.files.has(path.join(desktop, "小豆包.lnk"))).toBe(true);
  });

  it("covers one nested Start Menu publisher folder", async () => {
    const root = "C:/Programs";
    const nested = path.join(root, "Doubao AutoSkin Contributors");
    const fs = fakeFs([path.join(nested, "doubao-autoskin.lnk")], [nested]);
    await migrateShortcuts({ startMenu: root, fs });
    expect(fs.files.has(path.join(nested, "小豆包.lnk"))).toBe(true);
  });

  it("removes only stale old shortcut when destination exists", async () => {
    const desktop = "C:/Desktop";
    const fs = fakeFs([path.join(desktop, "doubao-autoskin.lnk"), path.join(desktop, "小豆包.lnk")]);
    await migrateShortcuts({ desktop, fs });
    expect(fs.files).toEqual(new Set([path.join(desktop, "小豆包.lnk")]));
  });

  it("swallows Start Menu enumeration failures", async () => {
    const fs = fakeFs([]);
    fs.readdir = async () => { throw new Error("EACCES"); };
    await expect(migrateShortcuts({ startMenu: "C:/Programs", fs })).resolves.toBeUndefined();
  });

  it("swallows copy failures", async () => {
    const desktop = "C:/Desktop";
    const fs = fakeFs([path.join(desktop, "doubao-autoskin.lnk")]);
    fs.copyFile = async () => { throw new Error("EACCES"); };
    await expect(migrateShortcuts({ desktop, fs })).resolves.toBeUndefined();
  });

  it("swallows stale-shortcut unlink failures", async () => {
    const desktop = "C:/Desktop";
    const fs = fakeFs([path.join(desktop, "doubao-autoskin.lnk"), path.join(desktop, "小豆包.lnk")]);
    fs.unlink = async () => { throw new Error("EACCES"); };
    await expect(migrateShortcuts({ desktop, fs })).resolves.toBeUndefined();
  });

  it("does not overwrite a destination that appears during migration", async () => {
    const desktop = "C:/Desktop";
    const oldPath = path.join(desktop, "doubao-autoskin.lnk");
    const newPath = path.join(desktop, "小豆包.lnk");
    const fs = fakeFs([oldPath]);
    fs.copyFile = async () => { fs.files.add(newPath); const error = new Error("EEXIST") as NodeJS.ErrnoException; error.code = "EEXIST"; throw error; };
    await migrateShortcuts({ desktop, fs });
    expect(fs.files).toEqual(new Set([newPath]));
  });
});
