# Doubao AutoSkin MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows 64-bit Electron application that creates, previews, imports, exports, applies, and restores static-image themes for the Doubao desktop client through loopback CDP.

**Architecture:** A sandboxed vanilla TypeScript renderer owns the editor and Canvas palette extraction; a narrow preload bridge calls the Electron main process for local storage, ZIP validation, Doubao launch, CDP, adapter loading, and injection. Theme CSS targets stable `dbs-*` semantic classes produced from one replaceable adapter JSON, never Doubao's internal selectors directly.

**Tech Stack:** Electron, TypeScript, Electron Forge with Vite, Vitest with Happy DOM, `fflate`, `postcss`, `postcss-selector-parser`, Node/Electron built-in `fetch` and `WebSocket`, PowerShell for development-only procedural theme art generation.

## Global Constraints

- Target Windows 10/11 64-bit; publish x64 only for the MVP.
- End users must not need Node.js, Git, or development tools.
- Use Electron, TypeScript, native HTML/CSS, and native browser controls; do not add React, Vue, or another UI framework.
- Support PNG, JPG, JPEG, and WebP static wallpapers only; reject GIF, APNG, and video.
- Accept one wallpaper up to 25 MB and 4096 pixels on its longest edge.
- Keep all theme processing local; do not add network requests, telemetry, accounts, payments, cloud sync, or DRM.
- Keep exactly three read-only built-in themes and unlimited local user themes.
- Use ordinary ZIP archives; do not register a custom archive extension.
- Themes may include scoped `extra.css` but never JavaScript, HTML, fonts, executables, remote URLs, `@import`, or `@font-face`.
- Inject only adapter-allowed Doubao targets; explicitly exclude `doubao-background`, `cross-site-support`, login, and auxiliary renderers.
- Do not modify Doubao executables, installed resources, or user conversation data.
- Default CDP port is 9225 and must bind to loopback; probe both `127.0.0.1` and `[::1]`.
- MVP has no startup watcher, system tray, automatic adapter download, or background recovery service.
- Closing the editor may stop reinjection; applying again after reopen is acceptable.
- Target editor memory is 180–280 MB; idle usage above 500 MB is a release blocker.
- Write production files through focused modules with one responsibility; avoid speculative interfaces with a single future consumer.
- Implement each behavior test-first and commit after every task.

---

## Planned File Map

```text
package.json                         scripts and dependency lock entry point
forge.config.ts                     Electron Forge/Vite/x64 packaging
tsconfig.json                       shared TypeScript rules
vite.main.config.ts                 Electron main bundle
vite.preload.config.ts              preload bundle
vite.renderer.config.ts             renderer bundle
vitest.config.ts                    Node and Happy DOM tests
src/shared/contracts.ts             theme, adapter, status, and IPC types
src/shared/defaults.ts              default theme values and limits
src/shared/palette-core.ts           pure RGBA quantization and palette derivation
src/shared/ipc.ts                   exact allowed IPC channel names
src/main/index.ts                   Electron lifecycle and BrowserWindow
src/main/ipc-handlers.ts            narrow renderer-to-main orchestration
src/main/paths.ts                   app data and built-in resource paths
src/main/log.ts                     capped privacy-safe text log
src/main/theme-store.ts             validate and persist user themes
src/main/css-validator.ts           scoped extra.css AST validation
src/main/theme-archive.ts           safe ZIP import/export
src/main/adapter-store.ts            built-in/user adapter validation and load
src/main/doubao-launcher.ts          executable discovery, port probe, process launch
src/main/cdp.ts                     CDP target/session client
src/main/injector.ts                payload construction, apply, verify, cleanup
src/preload/index.ts                contextBridge API
src/renderer/index.html             single-window shell
src/renderer/styles.css             editor layout and preview styling
src/renderer/app.ts                 DOM rendering and event wiring
src/renderer/editor-state.ts        reducer-like theme editing state
src/renderer/palette.ts             ImageBitmap/Canvas sampling adapter
src/renderer/preview.ts             chat/settings simplified preview
assets/adapters/doubao-adapter.json measured Doubao URL and selectors
assets/themes/*                     three generated built-in themes
tools/generate-theme-art.ps1        deterministic copyright-safe demo art
tools/inspect-doubao.mjs            development-only CDP DOM inventory
docs/theme-format.md                public theme/ZIP contract
docs/agent-theme-guide.md           instructions for an Agent to create themes
README.md                            install, use, restore, and limitations
tests/*.test.ts                     unit/integration coverage
```

### Task 1: Establish the Electron, TypeScript, and Test Skeleton

**Files:**
- Create: `package.json`
- Create: `forge.config.ts`
- Create: `tsconfig.json`
- Create: `vite.main.config.ts`
- Create: `vite.preload.config.ts`
- Create: `vite.renderer.config.ts`
- Create: `vitest.config.ts`
- Create: `src/shared/contracts.ts`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/app.ts`
- Create: `tests/contracts.test.ts`
- Verify: `docs/superpowers/specs/2026-08-08-doubao-autoskin-design.md`

**Interfaces:**
- Produces: `isThemeId(value: string): boolean`, the Electron entry points, and working `npm test`, `npm run typecheck`, `npm run start`, and `npm run make` scripts.

- [ ] **Step 1: Verify the approved design spec**

Run:

```powershell
Get-FileHash -Algorithm SHA256 docs\superpowers\specs\2026-08-08-doubao-autoskin-design.md
```

Expected SHA-256: `45770FC1CD285D24502473554B783A8FCC08E4BCF203B3386076FBA313970815`.

- [ ] **Step 2: Create package metadata and install only justified dependencies**

Use these package scripts:

```json
{
  "scripts": {
    "start": "electron-forge start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "make": "electron-forge make --arch=x64"
  }
}
```

Run:

```powershell
npm install fflate postcss postcss-selector-parser
npm install --save-dev electron @electron-forge/cli @electron-forge/maker-squirrel @electron-forge/maker-zip @electron-forge/plugin-vite typescript vite vitest happy-dom @types/node
```

- [ ] **Step 3: Write the first failing contract test**

```ts
import { describe, expect, it } from "vitest";
import { isThemeId } from "../src/shared/contracts";

describe("isThemeId", () => {
  it("accepts lowercase kebab-case only", () => {
    expect(isThemeId("clean-light")).toBe(true);
    expect(isThemeId("Clean Light")).toBe(false);
    expect(isThemeId("../escape")).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- tests/contracts.test.ts`

Expected: FAIL because `src/shared/contracts.ts` does not export `isThemeId`.

- [ ] **Step 5: Add the minimal shared contract and Electron window**

```ts
export const THEME_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isThemeId(value: string): boolean {
  return THEME_ID_PATTERN.test(value);
}
```

Create one 1180×760 `BrowserWindow` with `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, and `nodeIntegration: false`. Load the Vite renderer entry and render the text `Doubao AutoSkin` in `index.html`.

- [ ] **Step 6: Verify skeleton tests, types, and development launch**

Run:

```powershell
npm test
npm run typecheck
npm run start
```

Expected: tests and typecheck exit 0; one sandboxed window opens with `Doubao AutoSkin` and no renderer console error.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json forge.config.ts tsconfig.json vite.*.config.ts vitest.config.ts src tests docs
git commit -m "build: scaffold Electron MVP"
```

### Task 2: Define and Persist the Theme Contract

**Files:**
- Create: `src/shared/defaults.ts`
- Modify: `src/shared/contracts.ts`
- Create: `src/main/paths.ts`
- Create: `src/main/theme-store.ts`
- Create: `tests/theme-store.test.ts`

**Interfaces:**
- Produces: `Theme`, `ThemeSummary`, `validateTheme(input: unknown): ThemeValidationResult`, and `ThemeStore` methods `list()`, `load(id)`, `save(theme, asset)`, `remove(id)`, and `duplicate(id)`.

- [ ] **Step 1: Write failing validation and persistence tests**

```ts
it("rejects a theme that references a parent path", () => {
  const result = validateTheme({ ...validTheme, wallpaper: { ...validTheme.wallpaper, file: "../x.png" } });
  expect(result.ok).toBe(false);
});

it("round-trips a user theme atomically", async () => {
  const store = new ThemeStore(tempRoot, builtInRoot);
  await store.save(validTheme, { name: "wallpaper.png", bytes: PNG_BYTES });
  expect(await store.load(validTheme.id)).toEqual(validTheme);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- tests/theme-store.test.ts`

Expected: FAIL because the validator and store do not exist.

- [ ] **Step 3: Implement exact theme types and limits**

Define `Theme` with `formatVersion: 1`, `id`, `name`, `author`, `wallpaper`, `palette`, and `regions`. Export:

```ts
export const MAX_WALLPAPER_BYTES = 25 * 1024 * 1024;
export const MAX_WALLPAPER_EDGE = 4096;
export const WALLPAPER_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export type ThemeValidationResult = { ok: true; theme: Theme } | { ok: false; errors: string[] };
```

Validate numeric ranges, hex/rgba colors, `formatVersion === 1`, kebab-case ID, one root filename, and allowed extension. Ignore unknown JSON fields but materialize all missing optional region values from `DEFAULT_THEME`.

- [ ] **Step 4: Implement atomic ThemeStore writes**

Write into `<theme-id>.tmp-<random>`, validate the image header and dimensions, then rename to `<theme-id>`. Built-in summaries carry `readOnly: true`; `save` and `remove` reject built-in IDs. `duplicate("clean-light")` creates `clean-light-2` in the user directory.

- [ ] **Step 5: Run focused and full verification**

Run:

```powershell
npm test -- tests/theme-store.test.ts
npm test
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add src/shared src/main/paths.ts src/main/theme-store.ts tests/theme-store.test.ts
git commit -m "feat(theme): add validated local storage"
```

### Task 3: Implement Deterministic Local Palette Extraction

**Files:**
- Create: `src/shared/palette-core.ts`
- Create: `src/renderer/palette.ts`
- Create: `tests/palette-core.test.ts`

**Interfaces:**
- Consumes: `Theme["palette"]` from Task 2.
- Produces: `derivePaletteFromRgba(rgba: Uint8ClampedArray): DerivedPalette` and `extractPalette(bytes: ArrayBuffer, mime: string): Promise<DerivedPalette>`.

- [ ] **Step 1: Write failing quantization tests**

```ts
it("chooses the dominant saturated cluster and readable text", () => {
  const pixels = new Uint8ClampedArray([
    20, 90, 220, 255, 20, 90, 220, 255,
    250, 180, 40, 255, 255, 255, 255, 20
  ]);
  const palette = derivePaletteFromRgba(pixels);
  expect(palette.accent).toMatch(/^#[0-9a-f]{6}$/);
  expect(palette.route).toBe("dark");
  expect(palette.textContrast).toBeGreaterThanOrEqual(4.5);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- tests/palette-core.test.ts`

Expected: FAIL because `derivePaletteFromRgba` is missing.

- [ ] **Step 3: Implement the pure 64×64 algorithm**

Ignore alpha below 96, bucket each RGB channel with `value >> 5`, score main candidates by `count * (0.5 + saturation)`, prefer an accent at least 40 hue degrees away, and use average relative luminance 0.52 as the light/dark boundary. Mix surface and text colors until normal text reaches 4.5:1 contrast.

- [ ] **Step 4: Add the browser decoding adapter**

Use `createImageBitmap(new Blob([bytes], { type: mime }))`, draw to a 64×64 `OffscreenCanvas` or HTML canvas, call `getImageData`, close the bitmap, and pass pixels to the pure function. No image library dependency is allowed.

- [ ] **Step 5: Verify deterministic output**

Run:

```powershell
npm test -- tests/palette-core.test.ts
npm test
npm run typecheck
```

Expected: all commands exit 0 and repeated fixtures return identical palette objects.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/palette-core.ts src/renderer/palette.ts tests/palette-core.test.ts
git commit -m "feat(theme): derive local image palette"
```

### Task 4: Validate Scoped Theme CSS

**Files:**
- Create: `src/main/css-validator.ts`
- Create: `tests/css-validator.test.ts`

**Interfaces:**
- Produces: `validateExtraCss(css: string, themeId: string): CssValidationResult`.

- [ ] **Step 1: Write failing allow/deny tests**

```ts
expect(validateExtraCss(
  "html.doubao-skin.theme-clean-light .dbs-sidebar { opacity: .8 }",
  "clean-light"
).ok).toBe(true);

for (const css of [
  "body { color: red }",
  "@import 'https://example.com/x.css';",
  "html.doubao-skin.theme-clean-light { background: url(https://example.com/x) }"
]) {
  expect(validateExtraCss(css, "clean-light").ok).toBe(false);
}
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- tests/css-validator.test.ts`

Expected: FAIL because `validateExtraCss` is missing.

- [ ] **Step 3: Implement AST validation**

Parse with PostCSS and `postcss-selector-parser`. Allow ordinary rules, `@media`, and `@supports`; reject every other at-rule. Require each selector's first compound to contain `html.doubao-skin.theme-<id>` or `:root.doubao-skin.theme-<id>`. Reject declaration values containing `url(`, `expression(`, `behavior:`, or `-moz-binding`.

- [ ] **Step 4: Verify malformed CSS is a safe rejection**

Add an unbalanced-brace fixture and assert `{ ok: false }` rather than a thrown exception.

Run: `npm test -- tests/css-validator.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/main/css-validator.ts tests/css-validator.test.ts
git commit -m "feat(theme): validate scoped custom CSS"
```

### Task 5: Add Safe ZIP Import and Export

**Files:**
- Create: `src/main/theme-archive.ts`
- Create: `tests/theme-archive.test.ts`
- Modify: `src/main/theme-store.ts`

**Interfaces:**
- Consumes: `ThemeStore` and `validateExtraCss`.
- Produces: `exportThemeZip(id: string): Promise<Uint8Array>` and `importThemeZip(bytes: Uint8Array): Promise<ThemeSummary>`.

- [ ] **Step 1: Write a failing round-trip test**

```ts
it("exports, removes, and imports an equivalent theme", async () => {
  const archive = new ThemeArchive(store);
  const zip = await archive.exportThemeZip("clean-light-2");
  await store.remove("clean-light-2");
  const imported = await archive.importThemeZip(zip);
  expect((await store.load(imported.id)).palette).toEqual(validTheme.palette);
});
```

- [ ] **Step 2: Write failing malicious archive tests**

Create ZIP entries named `../escape.json`, `/absolute.json`, `nested.zip`, `theme.js`, and an expanded entry beyond 25 MB; assert each import rejects and the user theme directory remains unchanged.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm test -- tests/theme-archive.test.ts`

Expected: FAIL because `ThemeArchive` is missing.

- [ ] **Step 4: Implement the minimal fflate archive service**

Use `unzipSync`/`zipSync`; require exactly `theme.json`, one referenced wallpaper, and optional `extra.css`. Normalize entry names with POSIX separators before validation. Validate all entries in memory, then call the atomic ThemeStore save. Resolve imported ID conflicts with `-2`, `-3`, and later numeric suffixes.

- [ ] **Step 5: Verify focused and full suites**

Run:

```powershell
npm test -- tests/theme-archive.test.ts
npm test
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add src/main/theme-archive.ts src/main/theme-store.ts tests/theme-archive.test.ts
git commit -m "feat(theme): import and export safe ZIPs"
```

### Task 6: Load One Replaceable Adapter and Filter Targets

**Files:**
- Extend: `src/shared/contracts.ts`
- Create: `src/main/adapter-store.ts`
- Create: `assets/adapters/doubao-adapter.json`
- Create: `tests/adapter-store.test.ts`

**Interfaces:**
- Produces: `DoubaoAdapter`, `AdapterProbe`, `AdapterStore.load()`, `isAllowedTarget(url, adapter)`, and `probePage(queryCount, adapter, pageState)`.

- [ ] **Step 1: Write failing target and region tests**

```ts
expect(isAllowedTarget("doubao://doubao-chat/chat", adapter)).toBe(true);
expect(isAllowedTarget("doubao://doubao-background/", adapter)).toBe(false);
expect(isAllowedTarget("doubao://doubao-chat/cross-site-support/", adapter)).toBe(false);

const probe = probePage(selector => selector === "#root" ? 1 : 0, adapter, "chat");
expect(probe.status).toBe("incompatible");
expect(probe.missingRequired).toContain("chatArea");
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- tests/adapter-store.test.ts`

Expected: FAIL because adapter contracts are missing.

- [ ] **Step 3: Implement schema and precedence**

Validate `adapterVersion === 1`, non-empty target `urlPrefix`, known region keys, selector arrays, and page-state required region names. Load `%LOCALAPPDATA%\DoubaoSkin\adapter\doubao-adapter.json` when present; otherwise load the packaged adapter. Never merge two adapters.

- [ ] **Step 4: Keep the first packaged adapter deliberately conservative**

Set its only known target prefix to `doubao://doubao-chat/chat`. Leave measured selectors for Task 12, but make the development file fail closed until required regions are populated.

- [ ] **Step 5: Run verification and commit**

Run: `npm test -- tests/adapter-store.test.ts && npm test && npm run typecheck`

Expected: all commands exit 0.

```powershell
git add src/shared/contracts.ts src/main/adapter-store.ts assets/adapters tests/adapter-store.test.ts
git commit -m "feat(adapter): add fail-closed target map"
```

### Task 7: Build the CDP Client and Idempotent Injector

**Files:**
- Create: `src/main/cdp.ts`
- Create: `src/main/injector.ts`
- Create: `tests/cdp.test.ts`
- Create: `tests/injector.test.ts`

**Interfaces:**
- Consumes: `Theme`, `DoubaoAdapter`, `isAllowedTarget`, and `probePage`.
- Produces: `fetchTargets(port)`, `CdpSession`, `Injector.apply(theme)`, `Injector.verify()`, and `Injector.restore()`.

- [ ] **Step 1: Write failing dual-stack target selection tests**

Inject a fake fetch function that fails on `127.0.0.1` and succeeds on `[::1]`; assert `fetchTargets(9225)` returns the allowed chat target and excludes auxiliary URLs.

- [ ] **Step 2: Write failing payload invariants**

```ts
const payload = buildApplyExpression(validTheme, adapter, "data:image/png;base64,AA==", "");
expect(payload).toContain("doubao-autoskin-style");
expect(payload).toContain("doubao-autoskin-wallpaper");
expect(payload).toContain("__DOUBAO_SKIN_STATE__");
expect(payload).toContain("pointer-events: none");
```

Also assert the cleanup expression removes the fixed IDs, `doubao-skin`, `theme-*`, `dbs-*`, CSS variables, observers, and Blob URLs.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm test -- tests/cdp.test.ts tests/injector.test.ts`

Expected: FAIL because CDP and payload functions are missing.

- [ ] **Step 4: Implement the small CDP session**

Use built-in `fetch` and `WebSocket`. Correlate numeric request IDs with promises, enable `Runtime` and `Page`, expose `evaluate(expression)`, and reject all pending calls when the socket closes. Probe both loopback hosts with a 2-second timeout.

- [ ] **Step 5: Implement semantic marking and theme application**

The runtime must:

```ts
const STYLE_ID = "doubao-autoskin-style";
const WALLPAPER_ID = "doubao-autoskin-wallpaper";
const STATE_KEY = "__DOUBAO_SKIN_STATE__";
```

Convert the wallpaper Data URL to one Blob URL, mark adapter regions with `dbs-*`, add a debounced MutationObserver, replace existing style content on repeated apply, and listen for `Page.loadEventFired` while the editor process is alive. Required-region failure returns an incompatible result before adding theme layers.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm test -- tests/cdp.test.ts tests/injector.test.ts
npm test
npm run typecheck
```

Expected: all commands exit 0.

```powershell
git add src/main/cdp.ts src/main/injector.ts tests/cdp.test.ts tests/injector.test.ts
git commit -m "feat(cdp): apply and restore themes"
```

### Task 8: Find and Launch Doubao Safely

**Files:**
- Create: `src/main/doubao-launcher.ts`
- Create: `tests/doubao-launcher.test.ts`

**Interfaces:**
- Produces: `findDoubaoExecutable()`, `probeDoubaoPort(port)`, `buildDoubaoArgs(port)`, `launchDoubao(path, port)`, and `closeDoubaoGracefully()`.

- [ ] **Step 1: Write failing discovery and argument tests**

```ts
expect(buildDoubaoArgs(9225)).toEqual([
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=9225"
]);
expect(candidateDoubaoPaths({ LOCALAPPDATA: "C:\\Users\\A\\AppData\\Local" })[0])
  .toBe("C:\\Users\\A\\AppData\\Local\\Doubao\\Application\\Doubao.exe");
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- tests/doubao-launcher.test.ts`

Expected: FAIL because launcher helpers are missing.

- [ ] **Step 3: Implement safe process behavior**

Use `spawn(executable, args, { detached: true, stdio: "ignore" })` and `unref()`. If Doubao already has a visible process but CDP is absent, return `{ kind: "restart-required" }`; do not terminate it from a background check. Only an explicit confirmed IPC action may call `CloseMainWindow` through a short bundled PowerShell command, wait up to 10 seconds, and report failure rather than force-kill.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/doubao-launcher.test.ts && npm test && npm run typecheck`

Expected: all commands exit 0.

```powershell
git add src/main/doubao-launcher.ts tests/doubao-launcher.test.ts
git commit -m "feat(launcher): start Doubao with loopback CDP"
```

### Task 9: Expose a Narrow IPC and Preload API

**Files:**
- Create: `src/shared/ipc.ts`
- Create: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `tests/ipc.test.ts`

**Interfaces:**
- Produces renderer API methods: `listThemes`, `loadTheme`, `saveTheme`, `deleteTheme`, `duplicateTheme`, `importTheme`, `exportTheme`, `chooseWallpaper`, `getStatus`, `startDoubao`, `confirmRestart`, `applyTheme`, `restoreOfficial`, `readLog`, and `chooseDoubaoExecutable`.

- [ ] **Step 1: Write failing channel allowlist tests**

```ts
expect(Object.values(IPC_CHANNELS).sort()).toEqual([
  "adapter:status", "doubao:choose-executable", "doubao:restart",
  "doubao:start", "log:read", "skin:apply", "skin:restore",
  "theme:delete", "theme:duplicate", "theme:export", "theme:import",
  "theme:list", "theme:load", "theme:save", "wallpaper:choose"
].sort());
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- tests/ipc.test.ts`

Expected: FAIL because IPC contracts are missing.

- [ ] **Step 3: Implement handlers with validation at the boundary**

Every handler validates primitive arguments before calling a service. The preload exposes named methods only; it must not expose `ipcRenderer`, raw channel names, filesystem paths, `send`, or arbitrary invoke capability.

- [ ] **Step 4: Register handlers once and clean them on test teardown**

Export `registerIpcHandlers(services)` returning a cleanup function that calls `ipcMain.removeHandler` for each exact channel.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/ipc.test.ts && npm test && npm run typecheck`

Expected: all commands exit 0.

```powershell
git add src/shared/ipc.ts src/main/ipc-handlers.ts src/main/index.ts src/preload/index.ts tests/ipc.test.ts
git commit -m "feat(ipc): expose bounded editor API"
```

### Task 10: Build the Single-Window Editor and Preview

**Files:**
- Modify: `src/renderer/index.html`
- Create: `src/renderer/styles.css`
- Create: `src/renderer/editor-state.ts`
- Create: `src/renderer/preview.ts`
- Modify: `src/renderer/app.ts`
- Create: `tests/editor-state.test.ts`
- Create: `tests/renderer.test.ts`

**Interfaces:**
- Consumes: preload API, `Theme`, and `extractPalette`.
- Produces: `createEditorState(theme)`, `updateField(state, path, value)`, `undo(state)`, `resetRegion(state, region)`, `renderPreview(root, theme, page)`, and `mountApp(root, api)`.

- [ ] **Step 1: Write failing state tests**

```ts
it("updates, undoes, and resets one region", () => {
  let state = createEditorState(validTheme);
  state = updateField(state, ["regions", "sidebar", "opacity"], 0.55);
  expect(state.theme.regions.sidebar.opacity).toBe(0.55);
  state = undo(state);
  expect(state.theme.regions.sidebar.opacity).toBe(DEFAULT_THEME.regions.sidebar.opacity);
});
```

- [ ] **Step 2: Write a failing Happy DOM renderer test**

Mount the app with a fake preload API. Assert the DOM contains the top status, theme list, chat/settings preview tabs, region controls, and bottom actions. Click the apply button and assert `api.applyTheme` receives the saved theme ID exactly once.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm test -- tests/editor-state.test.ts tests/renderer.test.ts`

Expected: FAIL because editor modules are missing.

- [ ] **Step 4: Implement immutable editor state with a 30-entry undo stack**

Keep the reducer as plain functions. Do not add a state library. Reset only the active region to `DEFAULT_THEME`; wallpaper reset does not delete the selected file until the user confirms replacement.

- [ ] **Step 5: Implement the three-column UI**

Use semantic HTML, native `<input type="color">`, range+number pairs, and buttons. The preview uses only local DOM/CSS and switches between simplified chat and settings structures. It never embeds a Doubao URL.

- [ ] **Step 6: Wire wallpaper selection and palette extraction**

After `chooseWallpaper`, receive `{ name, mime, bytes }`, call `extractPalette`, update the draft, and render immediately. Save copies bytes through the preload API; apply remains a separate explicit click.

- [ ] **Step 7: Verify and commit**

Run:

```powershell
npm test -- tests/editor-state.test.ts tests/renderer.test.ts
npm test
npm run typecheck
```

Expected: all commands exit 0.

```powershell
git add src/renderer tests/editor-state.test.ts tests/renderer.test.ts
git commit -m "feat(ui): add theme editor and preview"
```

### Task 11: Integrate Status, Apply, Restore, and Privacy-Safe Logs

**Files:**
- Create: `src/main/log.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/renderer/app.ts`
- Create: `tests/log.test.ts`
- Create: `tests/workflow.test.ts`

**Interfaces:**
- Consumes: launcher, adapter, injector, theme store, and renderer API.
- Produces: exact statuses `not-running`, `restart-required`, `connecting`, `applied`, `partial`, `incompatible`, and `error`.

- [ ] **Step 1: Write failing capped-log and workflow tests**

Assert the log contains timestamp/stage/error/target/match-count fields, never a supplied conversation string, and truncates to the newest 2 MB. In the workflow fake, assert required selector failure calls neither style injection nor Doubao termination and returns `incompatible`.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- tests/log.test.ts tests/workflow.test.ts`

Expected: FAIL because logger and orchestration are incomplete.

- [ ] **Step 3: Implement the application workflow**

On startup: load settings, locate Doubao, probe CDP, and publish status. On apply: load theme and adapter, connect allowed targets, probe required regions, apply compatible pages, and return `applied` or `partial`. On restore: connect allowed targets only and call cleanup for each.

- [ ] **Step 4: Add close behavior without tray or watcher**

Closing the window quits the app. If an injector session is active, show one native confirmation: “退出后豆包页面重新加载时不会自动恢复皮肤。仍要退出吗？” Minimizing keeps the process and Page reload listener active.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/log.test.ts tests/workflow.test.ts && npm test && npm run typecheck`

Expected: all commands exit 0.

```powershell
git add src/main src/renderer/app.ts tests/log.test.ts tests/workflow.test.ts
git commit -m "feat(app): integrate safe skin workflow"
```

### Task 12: Measure the Real Doubao DOM and Finalize the Adapter

**Files:**
- Create: `tools/inspect-doubao.mjs`
- Modify: `assets/adapters/doubao-adapter.json`
- Create: `docs/doubao-adapter.md`
- Modify: `tests/adapter-store.test.ts`

**Interfaces:**
- Consumes: CDP target/session behavior from Task 7.
- Produces: a packaged adapter with non-empty required selectors for real chat and settings page states.

- [ ] **Step 1: Create the read-only inventory tool**

The script accepts `--port 9225`, probes both loopback hosts, prints target `type/title/url`, and evaluates only structural inventory: element tag, role, stable `data-*`/`aria-*` attributes, bounding boxes, and short labels. It must not print conversation text, input values, or account identifiers.

- [ ] **Step 2: Start Doubao with CDP and inventory the chat page**

Run:

```powershell
& "$env:LOCALAPPDATA\Doubao\Application\Doubao.exe" --remote-debugging-address=127.0.0.1 --remote-debugging-port=9225
node tools/inspect-doubao.mjs --port 9225
```

Expected: one allowed main target is identified; `doubao-background` and `cross-site-support` are printed as excluded.

- [ ] **Step 3: Navigate to settings and determine its real shape**

Open settings in Doubao, run the inventory again, and record whether it remains within `doubao://doubao-chat/chat` or creates a separate target. Add a separate target prefix only if observed. Choose semantic selectors that survive generated class-name changes, preferring `role`, `aria-*`, `data-*`, and stable structural relationships.

- [ ] **Step 4: Update adapter tests with measured selector fixtures**

Add a sanitized HTML fixture containing only the measured structural attributes. Assert chat and settings page states report compatible; removing each required fixture node reports incompatible.

- [ ] **Step 5: Verify real apply and restore manually**

Run the app, apply a draft theme, check sidebar/chat/composer/buttons/settings, then restore. Confirm no skin nodes or `dbs-*` markers remain and auxiliary targets were untouched.

- [ ] **Step 6: Commit**

```powershell
git add tools/inspect-doubao.mjs assets/adapters/doubao-adapter.json docs/doubao-adapter.md tests/adapter-store.test.ts
git commit -m "feat(adapter): map current Doubao UI"
```

### Task 13: Add Three Built-In Themes and Public Documentation

**Files:**
- Create: `tools/generate-theme-art.ps1`
- Create: `assets/themes/clean-light/theme.json`
- Create: `assets/themes/clean-light/wallpaper.png`
- Create: `assets/themes/midnight-ink/theme.json`
- Create: `assets/themes/midnight-ink/wallpaper.png`
- Create: `assets/themes/glass-blue/theme.json`
- Create: `assets/themes/glass-blue/wallpaper.png`
- Create: `docs/theme-format.md`
- Create: `docs/agent-theme-guide.md`
- Create: `README.md`
- Create: `tests/built-in-themes.test.ts`

**Interfaces:**
- Consumes: exact theme schema, CSS scope rules, and ThemeStore.
- Produces: three copyright-safe read-only themes and user-facing documentation.

- [ ] **Step 1: Write a failing built-in theme scan test**

```ts
it("ships exactly three valid read-only themes", async () => {
  const themes = await store.list();
  const builtIns = themes.filter(theme => theme.readOnly);
  expect(builtIns.map(x => x.id).sort()).toEqual([
    "clean-light", "glass-blue", "midnight-ink"
  ]);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- tests/built-in-themes.test.ts`

Expected: FAIL because built-in assets do not exist.

- [ ] **Step 3: Generate deterministic original art**

Use PowerShell `System.Drawing` to create three 2560×1440 PNG files with gradients and geometric light/noise motifs. Seed every random operation with a fixed integer, draw no logos, people, text, or third-party assets, and make repeated runs byte-identical.

- [ ] **Step 4: Add valid manifests**

`clean-light` demonstrates bright surfaces, `midnight-ink` demonstrates high-contrast dark surfaces, and `glass-blue` demonstrates translucent panels. All three must use the same standard region schema and no `extra.css` unless a standard field cannot express the intended visual.

- [ ] **Step 5: Write concise documentation**

README sections: requirements, install, first launch, create theme, import/export ZIP, apply, restore, known limitations, privacy, uninstall. Theme format documentation includes every field/range and archive rules. Agent guide gives a complete directory example and validation checklist, while explicitly prohibiting JavaScript and remote resources.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/built-in-themes.test.ts && npm test && npm run typecheck`

Expected: all commands exit 0.

```powershell
git add assets/themes tools/generate-theme-art.ps1 docs README.md tests/built-in-themes.test.ts
git commit -m "feat(theme): ship three starter themes"
```

### Task 14: Package, Create the Desktop Shortcut, and Complete Acceptance

**Files:**
- Modify: `forge.config.ts`
- Modify: `src/main/index.ts`
- Create: `assets/icon.ico`
- Create: `tests/package-smoke.test.ts`
- Create: `docs/acceptance-2026-08-08.md`

**Interfaces:**
- Produces: an x64 Windows installer, an app shortcut named `豆包皮肤版`, and recorded acceptance evidence.

- [ ] **Step 1: Write a failing packaged-resource smoke test**

Assert the Forge config includes `assets/themes`, `assets/adapters`, and `assets/icon.ico`; product name is `豆包皮肤版`; target arch is x64; and no production file imports development-only inspection code.

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- tests/package-smoke.test.ts`

Expected: FAIL until packaging metadata and icon are complete.

- [ ] **Step 3: Configure Squirrel packaging and shortcut naming**

Set `packagerConfig.name` to `doubao-autoskin`, `executableName` to `豆包皮肤版`, package icon to `assets/icon`, and maker `name`/`setupExe` to deterministic product names. Ensure app startup launches or connects to Doubao; the application shortcut itself is the required “豆包皮肤版” entry and no watcher/startup shortcut is installed.

- [ ] **Step 4: Run the full automated gate**

Run:

```powershell
npm test
npm run typecheck
npm run make
```

Expected: zero test failures, typecheck exit 0, and an x64 installer under `out\make`.

- [ ] **Step 5: Install and execute the real acceptance checklist**

Verify all four formats, all three built-ins, mouse controls, chat/settings application, core Doubao interactions, ZIP round-trip, adapter replacement, restore cleanliness, target exclusions, and editor memory. Record command outputs, observed Doubao version, measured memory, installer path, and each pass/fail in `docs/acceptance-2026-08-08.md`.

- [ ] **Step 6: Run final Git and artifact verification**

Run:

```powershell
git status --short
git log --oneline --decorate -15
Get-ChildItem -Recurse -File out\make | Select-Object FullName,Length
```

Expected: worktree clean after the acceptance commit; installer files are non-empty.

- [ ] **Step 7: Commit**

```powershell
git add forge.config.ts src/main/index.ts assets/icon.ico tests/package-smoke.test.ts docs/acceptance-2026-08-08.md
git commit -m "build: package Doubao AutoSkin MVP"
```

- [ ] **Step 8: Synchronize the completed repository to the requested path**

After verifying the resolved source and destination are distinct and the destination is absent, create `E:\develop_project` and clone the completed repository:

```powershell
git clone "E:\Marvis\Documents\ChatGPT\豆包皮肤工具" "E:\develop_project\doubao_autoskin"
```

Then run `git status --short --branch` and `npm test` in `E:\develop_project\doubao_autoskin`. The requested path is the final handoff location.

---

## Plan Self-Review Checklist

- Every included MVP requirement maps to Tasks 2–14.
- Every excluded capability remains absent from tasks and dependencies.
- Shared type names are defined before consumers use them.
- Every task has a failing-test step, a passing verification step, and a commit.
- Real Doubao chat/settings measurement is an explicit release gate, not an assumption.
- Final packaging and target-path synchronization are independently verified.
