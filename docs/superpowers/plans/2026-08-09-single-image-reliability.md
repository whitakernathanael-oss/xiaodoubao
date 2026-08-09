# Single-Image Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one uploaded photo drive a safe real-Doubao palette, verify and roll back failed injections, produce fresh Windows artifacts through one command, and remove code made obsolete by the image-first MVP.

**Architecture:** Keep the existing Electron, native DOM renderer, theme ZIP contract, safe CSS validator, and adapter boundary. Add one pure palette-to-theme mapper shared by renderer tests, make `SkinWorkflow` treat `Injector.apply()` plus `verify()` as one transaction, and put Windows release orchestration in a dependency-free Node script. Delete only code that has no runtime consumer after the simplified UI.

**Tech Stack:** TypeScript 7, Electron 43, Electron Forge 7, Vite 8, Vitest 4, Node.js built-ins, CDP, PostCSS, fflate.

## Global Constraints

- Windows-only MVP; do not add macOS support.
- Ordinary users see one-photo selection and automatic coloring, not an advanced color or CSS editor.
- Real Doubao text colors continue to follow Doubao and Windows appearance; never force body text colors.
- Keep developer theme ZIP import/export, optional scoped `extra.css`, adapters, and all three built-in themes compatible.
- Do not add multiple decorative assets, fonts, JavaScript, plugins, a store, accounts, payments, cloud APIs, tray residency, a watchdog, or auto-update.
- Release cleanup may delete only the resolved `<project-root>/out` directory.
- Preserve all pre-existing working-tree changes; never reset or overwrite unrelated files.

---

## File Map

- Create `src/shared/theme-coloring.ts`: pure `DerivedPalette` to safe `Theme` mapping.
- Create `tests/theme-coloring.test.ts`: mapping immutability and text-preservation tests.
- Modify `src/renderer/app.ts`: use the mapper after selecting one photo.
- Modify `src/main/injector.ts`: remove dead variables and expose semantic visibility verification.
- Modify `src/main/workflow.ts`: remove duplicate probing and make apply/verify/rollback transactional.
- Modify `tests/injector.test.ts` and `tests/workflow.test.ts`: behavior-level verification and rollback tests.
- Modify `src/renderer/editor-state.ts` and `tests/editor-state.test.ts`: remove undo/reset state with no UI consumer.
- Modify `src/shared/ipc.ts`, `src/preload.ts`, `src/main/ipc-handlers.ts`, `src/main/app-services.ts`, `src/main/log.ts`, `tests/ipc.test.ts`, `tests/log.test.ts`, and `tests/renderer.test.ts`: remove unused log-read IPC while retaining privacy-safe file logging.
- Modify `src/renderer/preview.ts`: remove unused preview variables.
- Create `tools/release-win.cjs`: guarded output cleanup, Forge invocation, and artifact reporting.
- Create `tests/release-win.test.ts`: output path and deletion-boundary tests.
- Modify `package.json` and `tests/package-smoke.test.ts`: expose and verify `release:win`.

---

### Task 1: Map One Photo to Safe Real-Theme Fields

**Files:**
- Create: `src/shared/theme-coloring.ts`
- Create: `tests/theme-coloring.test.ts`
- Modify: `src/renderer/app.ts:181-194`
- Test: `tests/theme-coloring.test.ts`
- Test: `tests/renderer.test.ts`

**Interfaces:**
- Consumes: `Theme` from `src/shared/contracts.ts` and `DerivedPalette` from `src/shared/palette-core.ts`.
- Produces: `applyDerivedPalette(theme: Theme, palette: DerivedPalette): Theme`.

- [ ] **Step 1: Write failing mapping tests**

```ts
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
    expect(original).toEqual(DEFAULT_THEME);
    expect(result).not.toBe(original);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `npm.cmd test -- tests/theme-coloring.test.ts`

Expected: FAIL because `src/shared/theme-coloring.ts` does not exist.

- [ ] **Step 3: Implement the pure mapper**

```ts
import type { Theme } from "./contracts";
import type { DerivedPalette } from "./palette-core";

export function applyDerivedPalette(theme: Theme, palette: DerivedPalette): Theme {
  return {
    ...structuredClone(theme),
    palette: {
      ink: palette.ink,
      mutedInk: palette.mutedInk,
      accent: palette.accent,
      surface: palette.surface
    },
    regions: {
      sidebar: {
        ...theme.regions.sidebar,
        backgroundColor: palette.surface,
        selectedColor: palette.accent,
        borderColor: palette.accent
      },
      chat: {
        ...theme.regions.chat,
        backgroundColor: palette.surface,
        borderColor: palette.accent
      },
      composer: {
        ...theme.regions.composer,
        backgroundColor: palette.surface,
        borderColor: palette.accent,
        focusColor: palette.accent
      },
      buttons: {
        ...theme.regions.buttons,
        primaryColor: palette.accent,
        backgroundColor: palette.surface,
        borderColor: palette.accent
      },
      settings: {
        ...theme.regions.settings,
        panelColor: palette.surface
      }
    }
  };
}
```

- [ ] **Step 4: Connect the mapper to photo selection**

In `src/renderer/app.ts`, import `applyDerivedPalette`. Replace the separate palette-only update with:

```ts
const derived = await extractPalette(copy.buffer, selection.mime);
state = {
  ...state,
  theme: applyDerivedPalette(state.theme, derived),
  dirty: true
};
state = updateField(state, ["wallpaper", "file"], selection.name);
```

Do not change any `regions.*.textColor` field and do not add a color control.

- [ ] **Step 5: Add a renderer behavior assertion**

Update the renderer API fake so `chooseWallpaper()` returns a one-pixel PNG selection in a dedicated test. Mock `extractPalette` only if browser image decoding is unavailable; assert the saved theme contains mapped accent/surface values and unchanged text fields.

- [ ] **Step 6: Run focused tests**

Run: `npm.cmd test -- tests/theme-coloring.test.ts tests/renderer.test.ts tests/palette-core.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the task files explicitly**

```powershell
git add -- src/shared/theme-coloring.ts src/renderer/app.ts tests/theme-coloring.test.ts tests/renderer.test.ts
git commit -m "feat: apply safe colors from one photo"
```

---

### Task 2: Verify Injection and Roll Back Transactionally

**Files:**
- Modify: `src/main/injector.ts:216-261`
- Modify: `src/main/workflow.ts:1-135`
- Modify: `tests/injector.test.ts`
- Modify: `tests/workflow.test.ts`

**Interfaces:**
- Produces: `buildVerifyExpression(adapter: DoubaoAdapter): string`.
- Changes: `WorkflowInjector` gains `verify(): Promise<boolean>`.
- Uses: `InjectionResult.status` as the only compatibility decision; removes `selectorProbeExpression()` and the workflow-level `probePage()` call.

- [ ] **Step 1: Write failing injector visibility tests**

Add behavior tests that apply the runtime to a happy-dom document, then evaluate `buildVerifyExpression(adapter)`:

```ts
const applied = await new Function(`return ${buildApplyExpression(
  DEFAULT_THEME,
  adapter,
  "data:image/png;base64,AA==",
  ""
)}`)();
expect(applied.status).toBe("compatible");
expect(await new Function(`return ${buildVerifyExpression(adapter)}`)()).toBe(true);

document.querySelector<HTMLElement>("main")!.style.display = "none";
expect(await new Function(`return ${buildVerifyExpression(adapter)}`)()).toBe(false);
```

- [ ] **Step 2: Run the injector test and verify failure**

Run: `npm.cmd test -- tests/injector.test.ts`

Expected: FAIL because `buildVerifyExpression` is not exported.

- [ ] **Step 3: Implement semantic verification**

Add a runtime function that checks the injection state, style, wallpaper, root class, required semantic classes, DOM connection, and computed visibility:

```ts
function verifyRuntime(adapter: DoubaoAdapter): boolean {
  const classNames: Record<string, string> = {
    appRoot: "dbs-app-root", sidebar: "dbs-sidebar", chatArea: "dbs-chat-area",
    messageUser: "dbs-message-user", messageAssistant: "dbs-message-assistant",
    composer: "dbs-composer", buttons: "dbs-button", settingsPanel: "dbs-settings-panel"
  };
  const settings = document.querySelector(`.${classNames.settingsPanel}`);
  const pageState = settings ? "settings" : "chat";
  const visible = (element: Element | null): boolean => {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  return Boolean(
    (window as unknown as Record<string, unknown>).__DOUBAO_SKIN_STATE__
    && document.getElementById("doubao-autoskin-style")
    && visible(document.getElementById("doubao-autoskin-wallpaper"))
    && document.documentElement.classList.contains("doubao-skin")
    && adapter.pageStates[pageState].requiredRegions.every((region) =>
      visible(document.querySelector(`.${classNames[region]}`))
    )
  );
}

export function buildVerifyExpression(adapter: DoubaoAdapter): string {
  return `(${verifyRuntime.toString()})(${JSON.stringify(adapter)})`;
}
```

Change `Injector.verify()` to evaluate `buildVerifyExpression(this.adapter)`.

- [ ] **Step 4: Write failing workflow transaction tests**

Create a shared injector fake with `apply`, `verify`, and `restore`. Define the helper completely in `tests/workflow.test.ts`:

```ts
function workflowWith(injector: WorkflowInjector): SkinWorkflow {
  return new SkinWorkflow({
    loadBundle: vi.fn(async () => ({
      theme: DEFAULT_THEME,
      asset: { name: "wallpaper.png", bytes: Uint8Array.of(1) },
      readOnly: true
    })),
    loadAdapter: vi.fn(async () => adapter),
    fetchTargets: vi.fn(async () => [{
      id: "chat",
      type: "page",
      title: "豆包",
      url: "doubao://doubao-chat/chat",
      webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/chat"
    }]),
    connect: vi.fn(async () => ({ evaluate: vi.fn(), close: vi.fn() })),
    createInjector: vi.fn(() => injector),
    log: { write: vi.fn(async () => undefined) }
  });
}

it("reports applied only after verification", async () => {
  const injector = {
    apply: vi.fn(async () => ({ status: "compatible", missingRequired: [], missingOptional: [] })),
    verify: vi.fn(async () => true),
    restore: vi.fn(async () => undefined)
  };
  const workflow = workflowWith(injector);
  await expect(workflow.apply(DEFAULT_THEME.id, 9225)).resolves.toEqual({ kind: "applied" });
  expect(injector.verify).toHaveBeenCalledOnce();
  expect(injector.restore).not.toHaveBeenCalled();
});

it("restores and reports error when verification fails", async () => {
  const injector = {
    apply: vi.fn(async () => ({ status: "compatible", missingRequired: [], missingOptional: [] })),
    verify: vi.fn(async () => false),
    restore: vi.fn(async () => undefined)
  };
  const workflow = workflowWith(injector);
  await expect(workflow.apply(DEFAULT_THEME.id, 9225)).resolves.toEqual({ kind: "error" });
  expect(injector.restore).toHaveBeenCalledOnce();
});
```

The helper must return a target and bundle without making the workflow call `session.evaluate()` directly.

- [ ] **Step 5: Replace duplicate probing with apply results**

Remove the `probePage` import and `selectorProbeExpression()`. For each target:

```ts
const session = await this.dependencies.connect(target.webSocketDebuggerUrl);
const injector = this.dependencies.createInjector(session, adapter);
const result = await injector.apply(bundle.theme, dataUrl(bundle), bundle.extraCss);
await this.dependencies.log.write({
  stage: "probe",
  targetUrl: target.url,
  status: result.status,
  matchCounts: {
    missingRequired: result.missingRequired.length,
    missingOptional: result.missingOptional.length
  }
});
if (result.status === "incompatible") {
  session.close();
  partial = true;
  continue;
}
if (!await injector.verify()) {
  try { await injector.restore(); }
  finally { session.close(); }
  throw new Error("Theme verification failed");
}
```

Add an async `rollbackActive()` that attempts `restore()` for every already-active injector, always closes its session, clears the map, and throws the first restore error only after all entries were attempted. The `apply()` catch block must call it before logging and returning `{ kind: "error" }`.

```ts
private async rollbackActive(): Promise<void> {
  let firstError: unknown;
  for (const { injector, session } of this.active.values()) {
    try { await injector.restore(); }
    catch (error) { firstError ??= error; }
    finally { session.close(); }
  }
  this.active.clear();
  if (firstError) throw firstError;
}
```

Use this catch shape so rollback failure cannot produce a success status:

```ts
} catch (error) {
  let reported = error;
  try { await this.rollbackActive(); }
  catch (rollbackError) { reported = rollbackError; }
  this.status = { kind: "error" };
  await this.dependencies.log.write({
    stage: "apply",
    status: "error",
    errorType: reported instanceof Error ? reported.name : "UnknownError"
  });
  return this.status;
}
```

- [ ] **Step 6: Run focused transaction tests**

Run: `npm.cmd test -- tests/injector.test.ts tests/workflow.test.ts`

Expected: all focused tests PASS, including compatible, partial, incompatible, verification failure, and restore failure.

- [ ] **Step 7: Commit the task files explicitly**

```powershell
git add -- src/main/injector.ts src/main/workflow.ts tests/injector.test.ts tests/workflow.test.ts
git commit -m "fix: verify and roll back skin injection"
```

---

### Task 3: Remove Image-First MVP Dead Code

**Files:**
- Modify: `src/renderer/editor-state.ts`
- Modify: `tests/editor-state.test.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/app-services.ts`
- Modify: `src/main/log.ts`
- Modify: `tests/ipc.test.ts`
- Modify: `tests/log.test.ts`
- Modify: `tests/renderer.test.ts`
- Modify: `src/renderer/app.ts`
- Modify: `src/renderer/preview.ts`
- Modify: `src/main/injector.ts`
- Modify: `tests/injector.test.ts`

**Interfaces:**
- `EditorState` becomes `{ theme: Theme; dirty: boolean }`.
- `DoubaoSkinApi` and `IpcServices` no longer expose `readLog()`.
- `PrivacyLog` remains a `LogWriter`; tests read its file through `node:fs/promises`.

- [ ] **Step 1: Rewrite editor-state tests around the surviving behavior**

```ts
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
```

- [ ] **Step 2: Simplify editor state**

Remove `ThemeRegions`, `DEFAULT_THEME`, `EditableRegion`, `undoStack`, `undo()`, and `resetRegion()`. Keep `clone()`, `createEditorState()`, path safety, immutable update, and `dirty`:

```ts
export interface EditorState {
  theme: Theme;
  dirty: boolean;
}

export function createEditorState(theme: Theme): EditorState {
  return { theme: structuredClone(theme), dirty: false };
}
```

Return `{ theme, dirty: true }` from `updateField()`.

- [ ] **Step 3: Remove the unused log-read IPC end to end**

Delete:

- `IPC_CHANNELS.logRead` and `DoubaoSkinApi.readLog()` from `src/shared/ipc.ts`.
- `readLog` from the frozen API in `src/preload.ts`.
- `IpcServices.readLog` and its handler from `src/main/ipc-handlers.ts`.
- `readLog: () => log.read()` from `src/main/app-services.ts`.
- `PrivacyLog.read()` from `src/main/log.ts`.
- `readLog` fakes and the `"log:read"` channel expectation from renderer and IPC tests.

In `tests/log.test.ts`, replace `await log.read()` with:

```ts
const text = await readFile(file, "utf8");
```

- [ ] **Step 4: Remove dead renderer and injector declarations**

- Remove `kind: "range"` from the wallpaper control descriptor and each descriptor entry.
- Remove the empty action-bar spacer element and set `.actionbar { justify-content: flex-end; }` for the remaining actions.
- Remove injector assignments for `--dbs-ink`, `--dbs-muted-ink`, `--dbs-accent`, `--dbs-surface`, and the raw opacity variables that have no CSS consumer.
- Remove preview assignments for `--p-surface` and raw opacity variables with no CSS consumer.
- Keep every variable referenced by generated CSS.

- [ ] **Step 5: Replace source-token assertions with behavior assertions**

In `tests/injector.test.ts`, keep expression parsing and happy-dom runtime tests. Remove individual `toContain()` assertions for implementation tokens such as `MutationObserver`, `URL.createObjectURL`, and variable names when the same behavior is already exercised. Retain assertions on observable status, created DOM nodes, cleanup, theme scope, and system text preservation.

- [ ] **Step 6: Run all cleanup-related tests**

Run: `npm.cmd test -- tests/editor-state.test.ts tests/ipc.test.ts tests/log.test.ts tests/renderer.test.ts tests/injector.test.ts`

Expected: all focused tests PASS and TypeScript reports no stale `readLog`, `undo`, or `resetRegion` references.

- [ ] **Step 7: Run type checking**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

- [ ] **Step 8: Commit the task files explicitly**

```powershell
git add -- src/renderer/editor-state.ts tests/editor-state.test.ts src/shared/ipc.ts src/preload.ts src/main/ipc-handlers.ts src/main/app-services.ts src/main/log.ts tests/ipc.test.ts tests/log.test.ts tests/renderer.test.ts src/renderer/app.ts src/renderer/preview.ts src/main/injector.ts tests/injector.test.ts
git commit -m "refactor: remove obsolete editor plumbing"
```

---

### Task 4: Add a Fresh Windows Release Command

**Files:**
- Create: `tools/release-win.cjs`
- Create: `tests/release-win.test.ts`
- Modify: `package.json`
- Modify: `tests/package-smoke.test.ts`

**Interfaces:**
- Produces: `removeOldOutput(projectRoot: string): string` and `artifactPaths(projectRoot: string): { setup: string; portable: string }` from the CommonJS helper.
- Produces: `npm run release:win` as the only formal local Windows release entry point.

- [ ] **Step 1: Write failing release-boundary tests**

```ts
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { artifactPaths, removeOldOutput } = require("../tools/release-win.cjs") as {
  artifactPaths(root: string): { setup: string; portable: string };
  removeOldOutput(root: string): string;
};

it("deletes only the project out directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "doubao-release-"));
  await mkdir(path.join(root, "out", "stale"), { recursive: true });
  await writeFile(path.join(root, "keep.txt"), "keep");
  expect(removeOldOutput(root)).toBe(path.join(root, "out"));
  await expect(stat(path.join(root, "out"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(path.join(root, "keep.txt"), "utf8")).toBe("keep");
});

it("resolves the exact Setup and portable executable paths", () => {
  expect(artifactPaths("C:\\project")).toEqual({
    setup: path.resolve("C:\\project", "out/make/squirrel.windows/x64/豆包皮肤版-Setup.exe"),
    portable: path.resolve("C:\\project", "out/doubao-autoskin-win32-x64/豆包皮肤版.exe")
  });
});
```

- [ ] **Step 2: Run the release helper test and verify failure**

Run: `npm.cmd test -- tests/release-win.test.ts`

Expected: FAIL because `tools/release-win.cjs` does not exist.

- [ ] **Step 3: Implement guarded cleanup and packaging**

```js
const { existsSync, readFileSync, rmSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function outputDirectory(projectRoot) {
  const root = path.resolve(projectRoot);
  const output = path.resolve(root, "out");
  if (path.dirname(output) !== root || path.basename(output) !== "out") {
    throw new Error("Refusing to clean an unexpected release directory");
  }
  return output;
}

function removeOldOutput(projectRoot) {
  const output = outputDirectory(projectRoot);
  rmSync(output, { recursive: true, force: true });
  return output;
}

function artifactPaths(projectRoot) {
  return {
    setup: path.resolve(projectRoot, "out/make/squirrel.windows/x64/豆包皮肤版-Setup.exe"),
    portable: path.resolve(projectRoot, "out/doubao-autoskin-win32-x64/豆包皮肤版.exe")
  };
}

function main() {
  if (process.platform !== "win32") throw new Error("release:win requires Windows");
  const projectRoot = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  if (packageJson.name !== "doubao-autoskin") throw new Error("Unexpected project root");
  removeOldOutput(projectRoot);
  const result = spawnSync("npm.cmd", ["run", "make"], { cwd: projectRoot, stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const artifacts = artifactPaths(projectRoot);
  for (const file of Object.values(artifacts)) {
    if (!existsSync(file)) throw new Error(`Release artifact is missing: ${file}`);
  }
  console.log(`豆包皮肤版 v${packageJson.version}`);
  console.log(`Setup: ${artifacts.setup}`);
  console.log(`Portable: ${artifacts.portable}`);
}

if (require.main === module) main();
module.exports = { artifactPaths, removeOldOutput };
```

- [ ] **Step 4: Add and test the package script**

Add exactly:

```json
"release:win": "npm run typecheck && npm test && node tools/release-win.cjs"
```

In `tests/package-smoke.test.ts`, assert the script equals that command and the release helper exists. This is configuration verification, not generated injection source testing.

- [ ] **Step 5: Run release-focused tests**

Run: `npm.cmd test -- tests/release-win.test.ts tests/package-smoke.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 6: Commit the task files explicitly**

```powershell
git add -- tools/release-win.cjs tests/release-win.test.ts package.json tests/package-smoke.test.ts
git commit -m "build: add verified Windows release command"
```

---

### Task 5: Full Verification, Artifact Check, and Delivery Sync

**Files:**
- Verify all files changed in Tasks 1-4.
- Synchronize only those changed paths to `E:\develop_project\doubao_autoskin` after local verification.

**Interfaces:**
- Consumes: `npm run release:win` from Task 4.
- Produces: fresh Setup and portable artifacts under `E:\develop_project\doubao_autoskin\out`.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm.cmd test`

Expected: every Vitest file PASS.

- [ ] **Step 2: Run strict type checking**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

- [ ] **Step 3: Run the formal release command in the workspace**

Run: `npm.cmd run release:win`

Expected: the command removes the old workspace `out`, reruns checks, produces both reported artifacts, and exits 0. If Squirrel/NuGet fails, preserve the exact log, diagnose that failure with `superpowers:systematic-debugging`, and do not claim release success.

- [ ] **Step 4: Verify artifact freshness and identity**

Run PowerShell read-only checks:

```powershell
$setup = Get-Item -LiteralPath 'out\make\squirrel.windows\x64\豆包皮肤版-Setup.exe'
$portable = Get-Item -LiteralPath 'out\doubao-autoskin-win32-x64\豆包皮肤版.exe'
$setup | Select-Object FullName,Length,LastWriteTime
$portable | Select-Object FullName,Length,LastWriteTime,@{Name='Version';Expression={$_.VersionInfo.ProductVersion}}
```

Expected: both files exist, have non-zero sizes, and timestamps belong to the current release run.

- [ ] **Step 5: Synchronize exact changed files to the delivery repository**

Before copying, resolve both roots and confirm the destination equals `E:\develop_project\doubao_autoskin`. Copy only the files listed in the File Map, creating `src/shared`, `tools`, and `tests` directories when needed. Do not copy `.git`, `node_modules`, `.vite`, or `out`. After copying, compare SHA-256 hashes for every copied file and require zero differences.

- [ ] **Step 6: Build fresh delivery artifacts**

Run from `E:\develop_project\doubao_autoskin`:

```powershell
npm.cmd run release:win
```

Expected: the old delivery `out` is removed and fresh Setup plus portable artifacts are generated at the paths printed by the script.

- [ ] **Step 7: Smoke-test the portable executable without installing**

Launch `E:\develop_project\doubao_autoskin\out\doubao-autoskin-win32-x64\豆包皮肤版.exe`, confirm the process remains alive long enough to create its window, and close it through its normal window close action. Do not silently run the Setup installer because installation changes system state.

- [ ] **Step 8: Report manual Doubao acceptance steps**

Provide the user these exact checks:

1. Open the fresh portable app or install the fresh Setup.
2. Start/connect Doubao.
3. Select one bright photo, save, and apply; confirm text stays readable and accents change.
4. Repeat with one dark photo.
5. Click restore official appearance.
6. Import one existing developer ZIP and confirm preview/application still work.

- [ ] **Step 9: Review repository status**

Run: `git status --short`

Expected: no task implementation files remain unstaged or uncommitted; pre-existing unrelated untracked design/plan files may remain and must be reported rather than deleted.
