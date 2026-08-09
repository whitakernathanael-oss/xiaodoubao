# Dominant Seed Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every uploaded wallpaper select one deterministic seed color, derive a readable same-family UI palette from it, and render the Doubao sidebar as seed-tinted translucent glass over the wallpaper.

**Architecture:** Keep the existing 3-bit RGB quantizer, then aggregate buckets into HSL color families and score those families before choosing one seed. Extend the transient `DerivedPalette` with tonal roles, map those roles into the unchanged persisted `Theme` schema, and update preview/injected CSS so the wallpaper sits beneath both chat and sidebar. No new color dependency is added.

**Tech Stack:** TypeScript 7, Vitest 4, happy-dom, Electron Forge/Vite, CSS `color-mix()` and `backdrop-filter`.

## Global Constraints

- Preserve the existing image decoding, 64×64 sampling, RGB quantization, theme ZIP format, and `Theme` persistence schema.
- Use HSL for the MVP; do not add Material Color Utilities, HCT, OKLCH, or another dependency.
- Candidate score is exactly `areaWeight * 0.55 + saturationScore * 0.20 + uiUsabilityScore * 0.15 + spatialContinuityScore * 0.10`.
- Treat circular hue distance `>= 90°` as a conflicting color family.
- If the top score gap is `< 15%` and hue distance is `> 90°`, resolve by area, continuity, UI usability, then moderate saturation.
- Only one `seedColor` may generate core UI roles; never RGB-average competing families.
- A conflicting second candidate must not generate `secondary`, `surface`, `surfaceVariant`, `background`, or other large UI roles.
- Black/white/gray wallpapers must use a neutral fallback.
- The sidebar must use approximately 70%–74% seed-tinted glass over the wallpaper while retaining readable text.
- Preserve existing history loading skeleton, populated conversation, wallpaper validation, adapter, and import/export behavior.

---

## File Structure

- `src/shared/palette-core.ts`: quantization, family aggregation, scoring, conflict resolution, seed selection, contrast-safe tonal palette.
- `src/renderer/palette.ts`: image decoding and 64×64 sampling; supplies sample width for spatial continuity.
- `src/shared/theme-coloring.ts`: maps transient tonal roles into the existing `Theme` fields without changing the ZIP schema.
- `src/renderer/preview.ts`: exposes theme opacity and wallpaper variables to the preview.
- `src/renderer/styles.css`: renders preview sidebar glass and translucent selected states.
- `src/main/injector.ts`: mounts wallpaper at the adapted root and injects real Doubao glass-sidebar CSS.
- `tests/palette-core.test.ts`: deterministic color fixtures and the seven required algorithm cases.
- `tests/theme-coloring.test.ts`: verifies all large UI roles come from the derived tonal palette.
- `tests/preview.test.ts`: verifies preview glass variables and CSS.
- `tests/injector.test.ts`: verifies root wallpaper mounting and transparent sidebar rules.
- `package.json`, `package-lock.json`: release version `0.1.6`.

---

### Task 1: Select One Dominant Seed and Derive a Tonal Palette

**Files:**
- Modify: `src/shared/palette-core.ts`
- Modify: `tests/palette-core.test.ts`

**Interfaces:**
- Consumes: `Uint8ClampedArray` RGBA samples and optional integer `sampleWidth`.
- Produces: `derivePaletteFromRgba(rgba: Uint8ClampedArray, sampleWidth?: number): DerivedPalette`.
- Produces: `DerivedPalette` fields `seedColor`, `primary`, `primaryHover`, `secondary`, `surfaceVariant`, `background`, `border`, `neutralFallback`, `competitionDetected`, plus existing `ink`, `mutedInk`, `accent`, `surface`, `route`, and `textContrast`.

- [ ] **Step 1: Add deterministic image-fixture helpers and the seven failing tests**

Add these helpers near the top of `tests/palette-core.test.ts`:

```ts
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

function hueDistance(first: number, second: number): number {
  const distance = Math.abs(first - second);
  return Math.min(distance, 360 - distance);
}
```

Add explicit tests using a `20 × 10` sample:

```ts
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
});

it("keeps dark blue and light blue in one family", () => {
  const palette = derivePaletteFromRgba(sample(20, 10, [
    { color: [20, 55, 125], columns: 11 },
    { color: [115, 180, 240], columns: 9 }
  ]), 20);
  expect(hueDistance(hue(palette.seedColor), hue(palette.secondary))).toBeLessThan(30);
  expect(palette.competitionDetected).toBe(false);
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
  expect(hueDistance(hue(palette.primary), hue(palette.surface))).toBeLessThanOrEqual(5);
});

it("does not let a small saturated red object beat the large background", () => {
  const palette = derivePaletteFromRgba(sample(20, 10, [
    { color: [65, 115, 155], columns: 18 },
    { color: [250, 20, 35], columns: 2 }
  ]), 20);
  expect(hueDistance(hue(palette.seedColor), 207)).toBeLessThan(25);
});
```

- [ ] **Step 2: Run the palette tests and confirm RED**

Run: `npm.cmd test -- tests/palette-core.test.ts`

Expected: FAIL because the current `DerivedPalette` has no `seedColor`, competition state, or tonal roles, and because the old ranking favors individual saturated buckets.

- [ ] **Step 3: Replace bucket ranking with family scoring and deterministic conflict resolution**

In `src/shared/palette-core.ts`:

1. Keep `Bucket`, RGBA validation, alpha threshold `96`, and 3-bit quantization.
2. Add `ColorFamily` with pixel count, RGB sums, member bucket keys, HSL representative, largest/neighbor continuity, and the four score components.
3. Merge chromatic buckets when circular hue distance is at most `35°`; permit lightness variation up to `0.35` so dark/light blue join. Keep red/orange non-conflicting even if they remain separate.
4. Map each visible sampled pixel back to its family and calculate continuity from four-neighbor adjacency when `sampleWidth` divides the pixel count; otherwise use `family.count / visibleCount` as the conservative continuity value.
5. Normalize components to `[0, 1]` and compute exactly:

```ts
const score = areaWeight * 0.55
  + saturationScore * 0.20
  + uiUsabilityScore * 0.15
  + spatialContinuityScore * 0.10;
```

6. Filter chromatic candidates with representative saturation `< 0.10`, lightness `< 0.07` or `> 0.93`; if chromatic area is less than 12% of visible pixels, use neutral fallback.
7. Sort by score, then area, then continuity, then UI usability, then moderate saturation, then stable family key.
8. Set `competitionDetected` only when the first two candidates have hue distance `> 90°` and relative score gap `< 0.15`. In that case re-apply the tie-break order area → continuity → usability → lower distance from saturation `0.65`.
9. Set exactly one `seedColor`; never call `mix()` with two candidate families.

- [ ] **Step 4: Derive every tonal role only from the chosen seed**

Add an HSL tonal generator in `src/shared/palette-core.ts` that keeps the seed hue fixed (neutral fallback uses saturation `0`) and clamps saturation/tone:

```ts
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
```

For light route, use approximate tones `primary .42`, `primaryHover .35`, `secondary .58`, `surface .96`, `surfaceVariant .90`, `background .98`, `border .72`; for dark route use `primary .66`, `primaryHover .74`, `secondary .48`, `surface .16`, `surfaceVariant .22`, `background .10`, `border .38`. Cap seed-derived surface saturation at `0.24`, secondary at `0.36`, and yellow-family primary saturation at `0.58`. Select black/white text by contrast and enforce `>= 4.5` using the existing `readableText` loop.

Populate legacy fields as aliases: `accent = primary`, `surface = tonal.surface`, `ink = tonal.text`, and `mutedInk = tonal.muted`.

- [ ] **Step 5: Run palette tests and confirm GREEN**

Run: `npm.cmd test -- tests/palette-core.test.ts`

Expected: all existing and seven new palette tests PASS.

- [ ] **Step 6: Commit the algorithm slice**

```powershell
git add -- src/shared/palette-core.ts tests/palette-core.test.ts
git commit -m "feat: select one wallpaper seed color"
```

---

### Task 2: Feed Spatial Dimensions and Map Tonal Roles into the Theme

**Files:**
- Modify: `src/renderer/palette.ts`
- Modify: `src/shared/theme-coloring.ts`
- Modify: `tests/theme-coloring.test.ts`

**Interfaces:**
- Consumes: Task 1 `derivePaletteFromRgba(rgba, sampleWidth)` and extended `DerivedPalette`.
- Produces: unchanged persisted `Theme`; no contract or ZIP format change.

- [ ] **Step 1: Write failing tonal-mapping assertions**

Extend the `DerivedPalette` fixture in `tests/theme-coloring.test.ts` with all Task 1 fields, then assert:

```ts
expect(result.regions.sidebar.backgroundColor).toBe(palette.surfaceVariant);
expect(result.regions.sidebar.opacity).toBe(0.72);
expect(result.regions.sidebar.selectedColor).toBe(palette.secondary);
expect(result.regions.chat.backgroundColor).toBe(palette.background);
expect(result.regions.chat.userBubbleColor).toBe(palette.secondary);
expect(result.regions.chat.assistantBubbleColor).toBe(palette.surfaceVariant);
expect(result.regions.composer.backgroundColor).toBe(palette.surface);
expect(result.regions.buttons.backgroundColor).toBe(palette.surfaceVariant);
expect(result.regions.settings.panelColor).toBe(palette.surface);
```

Also retain the structured-clone immutability assertions.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm.cmd test -- tests/theme-coloring.test.ts`

Expected: FAIL because current mapping uses only `accent` and `surface` and preserves opaque sidebar opacity.

- [ ] **Step 3: Pass sample width and map the tonal roles**

In both OffscreenCanvas and DOM canvas branches of `src/renderer/palette.ts`, change the call to:

```ts
return derivePaletteFromRgba(
  context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
  SAMPLE_SIZE
);
```

In `src/shared/theme-coloring.ts`, preserve the `Theme` schema but map tonal fields to regions. Set sidebar opacity to exactly `0.72`; set chat/composer/settings opacity no lower than the existing defaults so detailed wallpaper cannot destroy readability. Map palette text fields into region `textColor` fields because the new palette now guarantees contrast.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm.cmd test -- tests/palette-core.test.ts tests/theme-coloring.test.ts`

Run: `npm.cmd run typecheck`

Expected: both test files PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit the integration slice**

```powershell
git add -- src/renderer/palette.ts src/shared/theme-coloring.ts tests/theme-coloring.test.ts
git commit -m "feat: map seed tones into theme regions"
```

---

### Task 3: Render Wallpaper-Backed Glass Sidebars in Preview and Doubao

**Files:**
- Modify: `src/renderer/preview.ts`
- Modify: `src/renderer/styles.css`
- Modify: `src/main/injector.ts`
- Modify: `tests/preview.test.ts`
- Modify: `tests/injector.test.ts`

**Interfaces:**
- Consumes: existing `Theme.regions.sidebar.opacity` set to `0.72` by Task 2.
- Produces: preview CSS variables `--p-sidebar-alpha`, `--p-sidebar-layer`; injected CSS variable `--dbs-sidebar-alpha` and wallpaper mounted under the adapted app root.

- [ ] **Step 1: Write failing preview glass assertions**

Extend the wallpaper test in `tests/preview.test.ts`:

```ts
expect(root.style.getPropertyValue("--p-sidebar-alpha")).toBe("0.72");
expect(root.style.getPropertyValue("--p-sidebar-layer")).toContain("transparent");
const css = readFileSync(path.resolve("src/renderer/styles.css"), "utf8");
expect(css).toMatch(/\.preview__sidebar[^}]*backdrop-filter\s*:\s*blur\(/);
expect(css).toMatch(/\.preview__sidebar[^}]*background\s*:\s*var\(--p-sidebar-layer\)/);
```

- [ ] **Step 2: Write failing injector root/glass assertions**

Update the existing injector test whose title says wallpaper is mounted in the chat area so it expects `wallpaper.parentElement` to be `#root`. Add assertions:

```ts
expect(document.documentElement.style.getPropertyValue("--dbs-sidebar-alpha")).toBe("0.72");
expect(css).toContain("backdrop-filter: blur(");
expect(css).toContain("color-mix(in srgb, var(--dbs-sidebar-bg) 72%, transparent)");
expect(css).toContain('[data-testid="sidebar-section-item"] { background: transparent !important;');
```

- [ ] **Step 3: Run preview and injector tests and confirm RED**

Run: `npm.cmd test -- tests/preview.test.ts tests/injector.test.ts`

Expected: FAIL because the preview sidebar uses an opaque safety mix and injector prefers `chatArea` over `appRoot`.

- [ ] **Step 4: Implement preview glass variables and CSS**

In `src/renderer/preview.ts`, expose the numeric sidebar alpha and build `--p-sidebar-layer` from the theme color and transparent. Do not use `--p-contrast-base` as the opaque sidebar layer when wallpaper exists.

In `src/renderer/styles.css`:

```css
.preview__sidebar,
.preview__settings-nav {
  background: var(--p-sidebar-layer);
  backdrop-filter: blur(14px) saturate(1.08);
}

.preview nav a,
.preview__settings-nav a { background: transparent; }
```

Keep selected/hover states translucent and same-family through `--p-sidebar-selected`.

- [ ] **Step 5: Mount wallpaper at app root and inject real glass CSS**

In `src/main/injector.ts`:

1. Change host priority to `initial.appRoot[0] ?? initial.chatArea[0]`.
2. Set `--dbs-sidebar-alpha` from `theme.regions.sidebar.opacity` as an integer percentage.
3. Keep the wallpaper at `z-index: 0` and direct app children at `z-index: 1`.
4. Replace the opaque sidebar safety mix with:

```css
background: color-mix(in srgb, var(--dbs-sidebar-bg) var(--dbs-sidebar-alpha), transparent) !important;
backdrop-filter: blur(16px) saturate(1.08) !important;
```

5. Make ordinary `[data-testid="sidebar-section-item"]` backgrounds transparent and use translucent `--dbs-sidebar-selected` only for hover/active states.
6. Preserve the existing composer, greeting pseudo-element, populated conversation gradient, code-block, and history skeleton selectors unchanged.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `npm.cmd test -- tests/preview.test.ts tests/injector.test.ts`

Expected: both files PASS, including prior history and conversation regressions.

- [ ] **Step 7: Commit the glass-sidebar slice**

```powershell
git add -- src/renderer/preview.ts src/renderer/styles.css src/main/injector.ts tests/preview.test.ts tests/injector.test.ts
git commit -m "feat: add wallpaper-backed sidebar glass"
```

---

### Task 4: Full Regression, Version, Windows Build, and Delivery

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Verify: all `src/**`, `tests/**`, release output
- Copy delivery: source and artifacts to `E:\develop_project\doubao_autoskin`

**Interfaces:**
- Consumes: Tasks 1–3 completed and passing.
- Produces: version `0.1.6` portable executable and Squirrel installer.

- [ ] **Step 1: Run all tests before the version bump**

Run: `npm.cmd test`

Expected: all tests PASS; no failures in import/export, wallpaper validation, adapter probing, preview, injector, or theme store.

- [ ] **Step 2: Run typecheck**

Run: `npm.cmd run typecheck`

Expected: exit code `0` with no TypeScript diagnostics.

- [ ] **Step 3: Bump the package version to 0.1.6**

Run: `npm.cmd version 0.1.6 --no-git-tag-version`

Verify both `package.json` and `package-lock.json` contain `"version": "0.1.6"` for the root package.

- [ ] **Step 4: Re-run full verification after the bump**

Run: `npm.cmd run typecheck`

Run: `npm.cmd test`

Expected: both commands exit `0`.

- [ ] **Step 5: Build fresh Windows artifacts**

Run: `npm.cmd run release:win`

Expected artifacts:

```text
out/doubao-autoskin-win32-x64/豆包皮肤版.exe
out/make/squirrel.windows/x64/豆包皮肤版-Setup.exe
```

Rename/copy delivery artifacts as:

```text
E:\develop_project\doubao_autoskin\out\doubao-autoskin-0.1.6-win32-x64\豆包皮肤版.exe
E:\develop_project\doubao_autoskin\out\make\squirrel.windows\x64\豆包皮肤版-0.1.6-Setup.exe
```

- [ ] **Step 6: Request code review and address only evidence-backed findings**

Use `superpowers:requesting-code-review` against the complete diff. Verify reviewer findings against the spec and tests before applying them, then repeat focused tests for changed areas.

- [ ] **Step 7: Perform final verification and commit release metadata**

Run: `npm.cmd run typecheck`

Run: `npm.cmd test`

Run PowerShell `Get-Item` on both delivered executables and confirm non-zero file sizes and versioned paths.

```powershell
git add -- package.json package-lock.json
git commit -m "chore: release 0.1.6"
```

The handoff must report: modified files, original root cause, exact dominant score, conflict rule, seed-to-tonal derivation, remaining edge cases, test counts, and both executable paths.

