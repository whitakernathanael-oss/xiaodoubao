import type { ThemePalette } from "./contracts";

type Rgb = readonly [number, number, number];

interface Hsl {
  hue: number;
  saturation: number;
  lightness: number;
}

interface Bucket {
  key: number;
  count: number;
  red: number;
  green: number;
  blue: number;
}

interface ColorFamily extends Bucket {
  bucketKeys: number[];
  hsl: Hsl;
  areaWeight: number;
  saturationScore: number;
  uiUsabilityScore: number;
  spatialContinuityScore: number;
  score: number;
}

interface TonalPalette {
  primary: string;
  primaryHover: string;
  secondary: string;
  surface: string;
  surfaceVariant: string;
  background: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
}

export interface DerivedPalette extends ThemePalette, TonalPalette {
  seedColor: string;
  route: "light" | "dark";
  textContrast: number;
  neutralFallback: boolean;
  competitionDetected: boolean;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
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
  return `#${rgb.map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

function toHsl([redByte, greenByte, blueByte]: Rgb): Hsl {
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
  const normalizedHue = ((hue % 360) + 360) % 360;
  const safeSaturation = clamp(saturation);
  const safeLightness = clamp(lightness);
  const chroma = (1 - Math.abs(2 * safeLightness - 1)) * safeSaturation;
  const part = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const [red, green, blue]: Rgb = normalizedHue < 60 ? [chroma, part, 0]
    : normalizedHue < 120 ? [part, chroma, 0]
      : normalizedHue < 180 ? [0, chroma, part]
        : normalizedHue < 240 ? [0, part, chroma]
          : normalizedHue < 300 ? [part, 0, chroma]
            : [chroma, 0, part];
  const offset = safeLightness - chroma / 2;
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

function continuityForFamily(
  family: ColorFamily,
  familyIndex: number,
  pixelFamilies: Int16Array,
  sampleWidth: number | undefined
): number {
  if (!sampleWidth || sampleWidth <= 0 || pixelFamilies.length % sampleWidth !== 0) {
    return family.areaWeight;
  }
  const height = pixelFamilies.length / sampleWidth;
  const visited = new Uint8Array(pixelFamilies.length);
  let largest = 0;
  let touchingEdges = 0;
  let possibleEdges = 0;

  for (let index = 0; index < pixelFamilies.length; index += 1) {
    if (pixelFamilies[index] !== familyIndex || visited[index]) continue;
    const stack = [index];
    visited[index] = 1;
    let component = 0;
    while (stack.length > 0) {
      const current = stack.pop()!;
      component += 1;
      const x = current % sampleWidth;
      const y = Math.floor(current / sampleWidth);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < sampleWidth ? current + 1 : -1,
        y > 0 ? current - sampleWidth : -1,
        y + 1 < height ? current + sampleWidth : -1
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0) continue;
        possibleEdges += 1;
        if (pixelFamilies[neighbor] !== familyIndex) continue;
        touchingEdges += 1;
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }
    largest = Math.max(largest, component);
  }

  const componentScore = family.count === 0 ? 0 : largest / family.count;
  const neighborScore = possibleEdges === 0 ? 0 : touchingEdges / possibleEdges;
  return clamp(componentScore * 0.65 + neighborScore * 0.35);
}

function buildFamilies(
  buckets: Bucket[],
  visibleCount: number,
  pixelBucketKeys: Int16Array,
  sampleWidth?: number
): ColorFamily[] {
  const rawFamilies: ColorFamily[] = [];
  const chromaticBuckets = buckets
    .filter((bucket) => {
      const hsl = toHsl(bucketRgb(bucket));
      return hsl.saturation >= 0.1 && hsl.lightness >= 0.07 && hsl.lightness <= 0.93;
    })
    .sort((first, second) => second.count - first.count || first.key - second.key);

  for (const bucket of chromaticBuckets) {
    const hsl = toHsl(bucketRgb(bucket));
    const matching = rawFamilies.find((family) =>
      hueDistance(family.hsl.hue, hsl.hue) <= 35
      && Math.abs(family.hsl.lightness - hsl.lightness) <= 0.35
    );
    if (matching) {
      matching.count += bucket.count;
      matching.red += bucket.red;
      matching.green += bucket.green;
      matching.blue += bucket.blue;
      matching.key = Math.min(matching.key, bucket.key);
      matching.bucketKeys.push(bucket.key);
      matching.hsl = toHsl(bucketRgb(matching));
    } else {
      rawFamilies.push({
        ...bucket,
        bucketKeys: [bucket.key],
        hsl,
        areaWeight: 0,
        saturationScore: 0,
        uiUsabilityScore: 0,
        spatialContinuityScore: 0,
        score: 0
      });
    }
  }

  const families = rawFamilies
    .sort((first, second) => second.count - first.count || first.key - second.key)
    .slice(0, 8);
  const familyByBucket = new Map<number, number>();
  families.forEach((family, index) => {
    for (const key of family.bucketKeys) familyByBucket.set(key, index);
  });
  const pixelFamilies = new Int16Array(pixelBucketKeys.length).fill(-1);
  pixelBucketKeys.forEach((key, index) => {
    pixelFamilies[index] = familyByBucket.get(key) ?? -1;
  });

  families.forEach((family, index) => {
    family.areaWeight = family.count / visibleCount;
    family.saturationScore = clamp(family.hsl.saturation);
    const toneScore = clamp(1 - Math.abs(family.hsl.lightness - 0.5) / 0.45);
    const moderateSaturation = clamp(1 - Math.abs(family.hsl.saturation - 0.65) / 0.65);
    family.uiUsabilityScore = clamp(toneScore * 0.7 + moderateSaturation * 0.3);
    family.spatialContinuityScore = continuityForFamily(family, index, pixelFamilies, sampleWidth);
    family.score = family.areaWeight * 0.55
      + family.saturationScore * 0.20
      + family.uiUsabilityScore * 0.15
      + family.spatialContinuityScore * 0.10;
  });
  return families;
}

function compareFamilies(first: ColorFamily, second: ColorFamily): number {
  return second.score - first.score
    || second.areaWeight - first.areaWeight
    || second.spatialContinuityScore - first.spatialContinuityScore
    || second.uiUsabilityScore - first.uiUsabilityScore
    || Math.abs(first.hsl.saturation - 0.65) - Math.abs(second.hsl.saturation - 0.65)
    || first.key - second.key;
}

function resolveCompetition(first: ColorFamily, second: ColorFamily): ColorFamily {
  const byArea = second.areaWeight - first.areaWeight;
  if (Math.abs(byArea) > 1e-9) return byArea > 0 ? second : first;
  const byContinuity = second.spatialContinuityScore - first.spatialContinuityScore;
  if (Math.abs(byContinuity) > 1e-9) return byContinuity > 0 ? second : first;
  const byUsability = second.uiUsabilityScore - first.uiUsabilityScore;
  if (Math.abs(byUsability) > 1e-9) return byUsability > 0 ? second : first;
  const firstModeration = Math.abs(first.hsl.saturation - 0.65);
  const secondModeration = Math.abs(second.hsl.saturation - 0.65);
  if (Math.abs(firstModeration - secondModeration) > 1e-9) {
    return secondModeration < firstModeration ? second : first;
  }
  return first.key <= second.key ? first : second;
}

function deriveTones(seed: Hsl, route: "light" | "dark", neutral: boolean): TonalPalette {
  const hue = neutral ? 0 : seed.hue;
  const seedSaturation = neutral ? 0 : clamp(seed.saturation, 0.34, 0.78);
  const primarySaturation = neutral ? 0 : Math.min(seedSaturation, hue >= 35 && hue <= 75 ? 0.58 : 0.72);
  const secondarySaturation = neutral ? 0 : Math.min(seedSaturation * 0.58, 0.36);
  const surfaceSaturation = neutral ? 0 : Math.min(seedSaturation * 0.32, 0.24);
  const primary = fromHsl(hue, primarySaturation, route === "light" ? 0.42 : 0.66);
  const primaryHover = fromHsl(hue, primarySaturation, route === "light" ? 0.35 : 0.74);
  const secondary = fromHsl(hue, secondarySaturation, route === "light" ? 0.58 : 0.48);
  const surface = fromHsl(hue, surfaceSaturation, route === "light" ? 0.96 : 0.16);
  const surfaceVariant = fromHsl(hue, surfaceSaturation, route === "light" ? 0.90 : 0.22);
  const background = fromHsl(hue, surfaceSaturation * 0.72, route === "light" ? 0.98 : 0.10);
  const border = fromHsl(hue, Math.min(surfaceSaturation * 1.15, 0.28), route === "light" ? 0.72 : 0.38);
  const preferredText: Rgb = route === "light" ? [22, 25, 32] : [244, 246, 250];
  const targetText: Rgb = route === "light" ? [0, 0, 0] : [255, 255, 255];
  const text = readableText(preferredText, surface, targetText);
  const muted = mix(text, surface, 0.3);

  return {
    primary: toHex(primary),
    primaryHover: toHex(primaryHover),
    secondary: toHex(secondary),
    surface: toHex(surface),
    surfaceVariant: toHex(surfaceVariant),
    background: toHex(background),
    border: toHex(border),
    text: toHex(text),
    muted: toHex(muted),
    accent: toHex(primary)
  };
}

export function derivePaletteFromRgba(rgba: Uint8ClampedArray, sampleWidth?: number): DerivedPalette {
  if (rgba.length % 4 !== 0) throw new Error("RGBA sample length must be divisible by four");
  const buckets = new Map<number, Bucket>();
  const pixelBucketKeys = new Int16Array(rgba.length / 4).fill(-1);
  let count = 0;
  let totalLuminance = 0;
  let averageRed = 0;
  let averageGreen = 0;
  let averageBlue = 0;

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
    pixelBucketKeys[index / 4] = key;
    count += 1;
    averageRed += pixel[0];
    averageGreen += pixel[1];
    averageBlue += pixel[2];
    totalLuminance += luminance(pixel);
  }
  if (count === 0) throw new Error("Image sample has no visible pixels");

  const families = buildFamilies([...buckets.values()], count, pixelBucketKeys, sampleWidth).sort(compareFamilies);
  const chromaticArea = families.reduce((total, family) => total + family.count, 0) / count;
  const neutralFallback = families.length === 0 || chromaticArea < 0.12;
  const route: "light" | "dark" = totalLuminance / count >= 0.52 ? "light" : "dark";
  let competitionDetected = false;
  let seedRgb: Rgb;

  if (neutralFallback) {
    const average = (averageRed + averageGreen + averageBlue) / (count * 3);
    seedRgb = [average, average, average];
  } else {
    const first = families[0];
    const second = families[1];
    let dominant = first;
    if (second) {
      const relativeGap = first.score === 0 ? 1 : (first.score - second.score) / first.score;
      competitionDetected = hueDistance(first.hsl.hue, second.hsl.hue) > 90 && relativeGap < 0.15;
      if (competitionDetected) dominant = resolveCompetition(first, second);
    }
    seedRgb = bucketRgb(dominant);
  }

  const seedHsl = neutralFallback ? { hue: 0, saturation: 0, lightness: toHsl(seedRgb).lightness } : toHsl(seedRgb);
  const tonal = deriveTones(seedHsl, route, neutralFallback);
  const surfaceRgb = fromHsl(
    neutralFallback ? 0 : seedHsl.hue,
    neutralFallback ? 0 : Math.min(clamp(seedHsl.saturation, 0.34, 0.78) * 0.32, 0.24),
    route === "light" ? 0.96 : 0.16
  );
  const textRgb: Rgb = [1, 3, 5].map((index) => Number.parseInt(tonal.text.slice(index, index + 2), 16)) as unknown as Rgb;

  return {
    ...tonal,
    seedColor: toHex(seedRgb),
    ink: tonal.text,
    mutedInk: tonal.muted,
    route,
    textContrast: Math.round(contrast(textRgb, surfaceRgb) * 100) / 100,
    neutralFallback,
    competitionDetected
  };
}
