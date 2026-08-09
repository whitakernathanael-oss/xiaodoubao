import { describe, expect, it } from "vitest";
import { applyDerivedPalette } from "../src/shared/theme-coloring";
import { DEFAULT_THEME } from "../src/shared/defaults";
import type { DerivedPalette } from "../src/shared/palette-core";

const palette: DerivedPalette = {
  seedColor: "#2873c8",
  primary: "#276fbe",
  primaryHover: "#205a9a",
  secondary: "#6786a5",
  surface: "#eef3f8",
  surfaceVariant: "#d7e2ec",
  background: "#f7fafc",
  border: "#94abc0",
  text: "#161920",
  muted: "#575f68",
  ink: "#161920",
  mutedInk: "#575f68",
  accent: "#276fbe",
  route: "light",
  textContrast: 12.4,
  neutralFallback: false,
  competitionDetected: false
};

describe("safe automatic theme coloring", () => {
  it("maps one seed's tonal roles across every large UI surface", () => {
    const original = structuredClone(DEFAULT_THEME);
    const result = applyDerivedPalette(original, palette);

    expect(result.palette).toEqual({
      ink: palette.ink,
      mutedInk: palette.mutedInk,
      accent: palette.accent,
      surface: palette.surface
    });
    expect(result.regions.sidebar.backgroundColor).toBe(palette.surfaceVariant);
    expect(result.regions.sidebar.opacity).toBe(0.72);
    expect(result.regions.sidebar.selectedColor).toBe(palette.secondary);
    expect(result.regions.sidebar.borderColor).toBe(palette.border);
    expect(result.regions.chat.backgroundColor).toBe(palette.background);
    expect(result.regions.chat.userBubbleColor).toBe(palette.secondary);
    expect(result.regions.chat.assistantBubbleColor).toBe(palette.surfaceVariant);
    expect(result.regions.composer.backgroundColor).toBe(palette.surface);
    expect(result.regions.composer.focusColor).toBe(palette.primary);
    expect(result.regions.buttons.primaryColor).toBe(palette.primary);
    expect(result.regions.buttons.backgroundColor).toBe(palette.surfaceVariant);
    expect(result.regions.settings.panelColor).toBe(palette.surface);
    expect(result.regions.sidebar.textColor).toBe(palette.text);
    expect(result.regions.chat.textColor).toBe(palette.text);
    expect(result.regions.composer.textColor).toBe(palette.text);
    expect(result.regions.buttons.textColor).toBe(palette.text);
    expect(original).toEqual(DEFAULT_THEME);
    expect(result).not.toBe(original);
  });
});
