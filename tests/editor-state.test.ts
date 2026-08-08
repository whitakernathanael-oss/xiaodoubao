import { describe, expect, it } from "vitest";
import { createEditorState, resetRegion, undo, updateField } from "../src/renderer/editor-state";
import { DEFAULT_THEME } from "../src/shared/defaults";

describe("editor state", () => {
  it("updates, undoes, and resets one region", () => {
    let state = createEditorState(DEFAULT_THEME);
    state = updateField(state, ["regions", "sidebar", "opacity"], 0.55);
    expect(state.theme.regions.sidebar.opacity).toBe(0.55);
    state = undo(state);
    expect(state.theme.regions.sidebar.opacity).toBe(DEFAULT_THEME.regions.sidebar.opacity);

    state = updateField(state, ["regions", "sidebar", "opacity"], 0.4);
    state = resetRegion(state, "sidebar");
    expect(state.theme.regions.sidebar).toEqual(DEFAULT_THEME.regions.sidebar);
  });

  it("keeps at most thirty undo snapshots", () => {
    let state = createEditorState(DEFAULT_THEME);
    for (let value = 0; value < 35; value += 1) {
      state = updateField(state, ["wallpaper", "positionX"], value);
    }
    expect(state.undoStack).toHaveLength(30);
  });

  it("keeps the selected wallpaper filename when resetting wallpaper controls", () => {
    const selected = {
      ...DEFAULT_THEME,
      wallpaper: { ...DEFAULT_THEME.wallpaper, file: "my-photo.webp", blur: 12 }
    };
    const state = resetRegion(createEditorState(selected), "wallpaper");
    expect(state.theme.wallpaper.file).toBe("my-photo.webp");
    expect(state.theme.wallpaper.blur).toBe(DEFAULT_THEME.wallpaper.blur);
  });
});
