import { describe, expect, it } from "vitest";
import { applyDerivedPalette } from "../src/shared/theme-coloring";
import { DEFAULT_THEME } from "../src/shared/defaults";
import type { DerivedPalette } from "../src/shared/palette-core";

const palette: DerivedPalette = {
  ink: "#101820",
  mutedInk: "#53606a",
  accent: "#2c8cff",
  surface: "#e8f2ff",
  route: "light",
  textContrast: 12.4
};

describe("safe automatic theme coloring", () => {
  it("maps image colors to surfaces and accents without forcing text", () => {
    const original = structuredClone(DEFAULT_THEME);
    const result = applyDerivedPalette(original, palette);

    expect(result.palette).toEqual({
      ink: palette.ink,
      mutedInk: palette.mutedInk,
      accent: palette.accent,
      surface: palette.surface
    });
    expect(result.regions.sidebar.selectedColor).toBe(palette.accent);
    expect(result.regions.composer.focusColor).toBe(palette.accent);
    expect(result.regions.buttons.primaryColor).toBe(palette.accent);
    expect(result.regions.sidebar.backgroundColor).toBe(palette.surface);
    expect(result.regions.chat.backgroundColor).toBe(palette.surface);
    expect(result.regions.sidebar.textColor).toBe(DEFAULT_THEME.regions.sidebar.textColor);
    expect(result.regions.chat.textColor).toBe(DEFAULT_THEME.regions.chat.textColor);
    expect(result.regions.composer.textColor).toBe(DEFAULT_THEME.regions.composer.textColor);
    expect(result.regions.buttons.textColor).toBe(DEFAULT_THEME.regions.buttons.textColor);
    expect(original).toEqual(DEFAULT_THEME);
    expect(result).not.toBe(original);
  });
});
