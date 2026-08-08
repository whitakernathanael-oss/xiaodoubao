import type { ThemePalette } from "./contracts";

type Rgb = readonly [number, number, number];

interface Bucket {
  key: number;
  count: number;
  red: number;
  green: number;
  blue: number;
}

export interface DerivedPalette extends ThemePalette {
  route: "light" | "dark";
  textContrast: number;
}

function channelLuminance(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: Rgb): number {
  return 0.2126 * channelLuminance(red)
    + 0.7152 * channelLuminance(green)
    + 0.0722 * channelLuminance(blue);
}

function contrast(first: Rgb, second: Rgb): number {
  const bright = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (bright + 0.05) / (dark + 0.05);
}

function mix(first: Rgb, second: Rgb, amount: number): Rgb {
  return [
    first[0] + (second[0] - first[0]) * amount,
    first[1] + (second[1] - first[1]) * amount,
    first[2] + (second[2] - first[2]) * amount
  ];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function toHsl([redByte, greenByte, blueByte]: Rgb): { hue: number; saturation: number; lightness: number } {
  const red = redByte / 255;
  const green = greenByte / 255;
  const blue = blueByte / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation, lightness };
}

function fromHsl(hue: number, saturation: number, lightness: number): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const part = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const [red, green, blue]: Rgb = hue < 60 ? [chroma, part, 0]
    : hue < 120 ? [part, chroma, 0]
      : hue < 180 ? [0, chroma, part]
        : hue < 240 ? [0, part, chroma]
          : hue < 300 ? [part, 0, chroma]
            : [chroma, 0, part];
  const offset = lightness - chroma / 2;
  return [(red + offset) * 255, (green + offset) * 255, (blue + offset) * 255];
}

function bucketRgb(bucket: Bucket): Rgb {
  return [bucket.red / bucket.count, bucket.green / bucket.count, bucket.blue / bucket.count];
}

function hueDistance(first: number, second: number): number {
  const distance = Math.abs(first - second);
  return Math.min(distance, 360 - distance);
}

function readableText(initial: Rgb, surface: Rgb, target: Rgb): Rgb {
  if (contrast(initial, surface) >= 4.5) return initial;
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(initial, target, step / 20);
    if (contrast(candidate, surface) >= 4.5) return candidate;
  }
  return target;
}

export function derivePaletteFromRgba(rgba: Uint8ClampedArray): DerivedPalette {
  if (rgba.length % 4 !== 0) throw new Error("RGBA sample length must be divisible by four");
  const buckets = new Map<number, Bucket>();
  let count = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  let totalLuminance = 0;

  for (let index = 0; index < rgba.length; index += 4) {
    if (rgba[index + 3] < 96) continue;
    const pixel: Rgb = [rgba[index], rgba[index + 1], rgba[index + 2]];
    const key = (pixel[0] >> 5) << 6 | (pixel[1] >> 5) << 3 | (pixel[2] >> 5);
    const current = buckets.get(key) ?? { key, count: 0, red: 0, green: 0, blue: 0 };
    current.count += 1;
    current.red += pixel[0];
    current.green += pixel[1];
    current.blue += pixel[2];
    buckets.set(key, current);
    count += 1;
    red += pixel[0];
    green += pixel[1];
    blue += pixel[2];
    totalLuminance += luminance(pixel);
  }
  if (count === 0) throw new Error("Image sample has no visible pixels");

  const ranked = [...buckets.values()].sort((first, second) => {
    const firstScore = first.count * (0.5 + toHsl(bucketRgb(first)).saturation);
    const secondScore = second.count * (0.5 + toHsl(bucketRgb(second)).saturation);
    return secondScore - firstScore || first.key - second.key;
  });
  const main = bucketRgb(ranked[0]);
  const mainHsl = toHsl(main);
  const accentBucket = ranked.slice(1).find((candidate) => {
    const hsl = toHsl(bucketRgb(candidate));
    return hsl.saturation >= 0.35 && hueDistance(mainHsl.hue, hsl.hue) >= 40;
  });
  const accent = accentBucket
    ? bucketRgb(accentBucket)
    : fromHsl((mainHsl.hue + 140) % 360, Math.max(mainHsl.saturation, 0.58), Math.min(0.62, Math.max(0.42, mainHsl.lightness)));

  const route: "light" | "dark" = totalLuminance / count >= 0.52 ? "light" : "dark";
  const average: Rgb = [red / count, green / count, blue / count];
  const surface = route === "light"
    ? mix(average, [255, 255, 255], 0.9)
    : mix(average, [20, 24, 30], 0.78);
  const darkest = bucketRgb([...buckets.values()].sort((first, second) => luminance(bucketRgb(first)) - luminance(bucketRgb(second)) || first.key - second.key)[0]);
  const ink = readableText(route === "light" ? darkest : [235, 238, 244], surface, route === "light" ? [0, 0, 0] : [255, 255, 255]);
  const mutedInk = mix(ink, surface, 0.3);

  return {
    ink: toHex(ink),
    mutedInk: toHex(mutedInk),
    accent: toHex(accent),
    surface: toHex(surface),
    route,
    textContrast: Math.round(contrast(ink, surface) * 100) / 100
  };
}
