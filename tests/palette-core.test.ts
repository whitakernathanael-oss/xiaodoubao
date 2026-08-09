import { describe, expect, it } from "vitest";
import { derivePaletteFromRgba } from "../src/shared/palette-core";

type Rgb = readonly [number, number, number];

function sample(width: number, height: number, bands: Array<{ color: Rgb; columns: number }>): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  let column = 0;
  for (const band of bands) {
    for (let x = column; x < column + band.columns; x += 1) {
      for (let y = 0; y < height; y += 1) {
        const index = (y * width + x) * 4;
        pixels.set([...band.color, 255], index);
      }
    }
    column += band.columns;
  }
  return pixels;
}

function hue(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return 0;
  const raw = max === red ? ((green - blue) / delta) % 6
    : max === green ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  return (raw * 60 + 360) % 360;
}

function saturation(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const lightness = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
}

function hueDistance(first: number, second: number): number {
  const distance = Math.abs(first - second);
  return Math.min(distance, 360 - distance);
}

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

  it("chooses blue for 55% blue and 40% yellow", () => {
    const palette = derivePaletteFromRgba(sample(20, 10, [
      { color: [35, 105, 210], columns: 11 },
      { color: [242, 205, 70], columns: 8 },
      { color: [120, 120, 120], columns: 1 }
    ]), 20);

    expect(hueDistance(hue(palette.seedColor), 216)).toBeLessThan(25);
    expect(palette.competitionDetected).toBe(true);
  });

  it("chooses and tones yellow for 55% yellow and 40% blue", () => {
    const palette = derivePaletteFromRgba(sample(20, 10, [
      { color: [242, 205, 70], columns: 11 },
      { color: [35, 105, 210], columns: 8 },
      { color: [120, 120, 120], columns: 1 }
    ]), 20);

    expect(hueDistance(hue(palette.seedColor), 48)).toBeLessThan(25);
    expect(palette.primary).not.toBe("#f2cd46");
    expect(saturation(palette.primary)).toBeLessThanOrEqual(0.6);
  });

  it("keeps dark blue and light blue in one family", () => {
    const palette = derivePaletteFromRgba(sample(20, 10, [
      { color: [20, 55, 125], columns: 11 },
      { color: [115, 180, 240], columns: 9 }
    ]), 20);

    expect(hueDistance(hue(palette.seedColor), hue(palette.secondary))).toBeLessThan(30);
    expect(palette.competitionDetected).toBe(false);
  });

  it("aggregates separated blue tones before competing with a yellow family", () => {
    const palette = derivePaletteFromRgba(sample(10, 10, [
      { color: [20, 55, 125], columns: 3 },
      { color: [115, 180, 240], columns: 3 },
      { color: [242, 205, 70], columns: 4 }
    ]), 10);

    expect(hueDistance(hue(palette.seedColor), 215)).toBeLessThan(25);
    expect(palette.seedColor).not.toBe("#14377d");
    expect(palette.seedColor).not.toBe("#73b4f0");
  });

  it("does not mark red and orange as conflicting families", () => {
    const palette = derivePaletteFromRgba(sample(20, 10, [
      { color: [205, 50, 50], columns: 11 },
      { color: [235, 125, 35], columns: 9 }
    ]), 20);

    expect(palette.competitionDetected).toBe(false);
    expect(hueDistance(hue(palette.seedColor), hue(palette.secondary))).toBeLessThan(30);
  });

  it("resolves a near-tied blue-yellow competition to exactly one seed", () => {
    const palette = derivePaletteFromRgba(sample(20, 10, [
      { color: [35, 105, 210], columns: 10 },
      { color: [242, 205, 70], columns: 10 }
    ]), 20);

    expect(palette.competitionDetected).toBe(true);
    expect(hueDistance(hue(palette.seedColor), hue(palette.background))).toBeLessThan(30);
    expect(hueDistance(hue(palette.seedColor), hue(palette.secondary))).toBeLessThan(30);
  });

  it("uses neutral fallback for black white and gray", () => {
    const palette = derivePaletteFromRgba(sample(20, 10, [
      { color: [18, 18, 18], columns: 7 },
      { color: [128, 128, 128], columns: 7 },
      { color: [242, 242, 242], columns: 6 }
    ]), 20);

    expect(palette.neutralFallback).toBe(true);
    expect(saturation(palette.primary)).toBeLessThanOrEqual(0.03);
    expect(saturation(palette.surface)).toBeLessThanOrEqual(0.03);
  });

  it("does not let a small saturated red object beat the large background", () => {
    const palette = derivePaletteFromRgba(sample(20, 10, [
      { color: [65, 115, 155], columns: 18 },
      { color: [250, 20, 35], columns: 2 }
    ]), 20);

    expect(hueDistance(hue(palette.seedColor), 207)).toBeLessThan(25);
  });
});
