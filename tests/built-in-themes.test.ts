import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeStore } from "../src/main/theme-store";

describe("built-in themes", () => {
  let userRoot: string;
  afterEach(async () => { if (userRoot) await rm(userRoot, { recursive: true, force: true }); });

  it("ships exactly three valid read-only themes with valid wallpapers", async () => {
    userRoot = await mkdtemp(path.join(tmpdir(), "doubao-built-ins-"));
    const store = new ThemeStore(userRoot, path.join(process.cwd(), "assets", "themes"));
    const themes = await store.list();
    const builtIns = themes.filter((theme) => theme.readOnly);

    expect(builtIns.map((theme) => theme.id).sort()).toEqual([
      "clean-light", "glass-blue", "midnight-ink"
    ]);
    for (const theme of builtIns) {
      const bundle = await store.readBundle(theme.id);
      expect(bundle.asset.bytes.byteLength).toBeGreaterThan(1000);
      expect(bundle.readOnly).toBe(true);
    }
  });
});
