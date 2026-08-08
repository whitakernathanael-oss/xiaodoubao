import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBundledPaths } from "../src/main/paths";

describe("bundled resource paths", () => {
  it("uses source assets during development", () => {
    expect(resolveBundledPaths(false, "C:\\project", "C:\\resources")).toEqual({
      themes: path.join("C:\\project", "assets", "themes"),
      adapter: path.join("C:\\project", "assets", "adapters", "doubao-adapter.json")
    });
  });

  it("uses Electron extraResource destinations after packaging", () => {
    expect(resolveBundledPaths(true, "C:\\project", "C:\\resources")).toEqual({
      themes: path.join("C:\\resources", "themes"),
      adapter: path.join("C:\\resources", "adapters", "doubao-adapter.json")
    });
  });
});
