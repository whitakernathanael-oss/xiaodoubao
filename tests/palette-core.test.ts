import { describe, expect, it } from "vitest";
import { derivePaletteFromRgba } from "../src/shared/palette-core";

describe("local palette derivation", () => {
  it("chooses a saturated accent and readable text for a dark image", () => {
    const pixels = new Uint8ClampedArray([
      20, 90, 220, 255,
      20, 90, 220, 255,
      250, 180, 40, 255,
      255, 255, 255, 20
    ]);

    const palette = derivePaletteFromRgba(pixels);

    expect(palette.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.route).toBe("dark");
    expect(palette.textContrast).toBeGreaterThanOrEqual(4.5);
  });

  it("ignores pixels whose alpha is below 96", () => {
    const withTransparentRed = new Uint8ClampedArray([
      245, 245, 245, 255,
      245, 245, 245, 255,
      255, 0, 0, 95
    ]);
    const withoutTransparentRed = withTransparentRed.slice(0, 8);

    expect(derivePaletteFromRgba(withTransparentRed)).toEqual(
      derivePaletteFromRgba(withoutTransparentRed)
    );
  });

  it("returns identical output for identical input", () => {
    const pixels = new Uint8ClampedArray([
      10, 20, 30, 255,
      80, 160, 220, 255,
      230, 240, 250, 255
    ]);
    expect(derivePaletteFromRgba(pixels)).toEqual(derivePaletteFromRgba(pixels));
  });

  it("rejects a sample with no visible pixels", () => {
    expect(() => derivePaletteFromRgba(new Uint8ClampedArray([1, 2, 3, 0]))).toThrow(
      /visible pixels/i
    );
  });
});
