import { describe, expect, it } from "vitest";
import { createEditorState, updateField } from "../src/renderer/editor-state";
import { DEFAULT_THEME } from "../src/shared/defaults";

describe("editor state", () => {
  it("updates a valid field without mutating its input", () => {
    const initial = createEditorState(DEFAULT_THEME);
    const changed = updateField(initial, ["wallpaper", "positionX"], 35);

    expect(changed.theme.wallpaper.positionX).toBe(35);
    expect(initial.theme.wallpaper.positionX).toBe(DEFAULT_THEME.wallpaper.positionX);
    expect(changed.dirty).toBe(true);
  });

  it("rejects prototype and missing paths", () => {
    const state = createEditorState(DEFAULT_THEME);

    expect(() => updateField(state, ["__proto__", "polluted"], true)).toThrow();
    expect(() => updateField(state, ["wallpaper", "missing"], true)).toThrow();
  });
});
