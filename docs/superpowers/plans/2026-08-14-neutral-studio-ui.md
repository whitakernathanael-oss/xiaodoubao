# Neutral Studio UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crowded purple editor shell with the approved neutral black-white-gray desktop workspace while preserving every existing theme and automation behavior.

**Architecture:** Keep the current vanilla TypeScript renderer and IPC contract. Restructure only `mountApp()` markup and renderer CSS, reusing all existing `data-action` selectors and event wiring. Tests assert semantic placement and behavior rather than screenshot pixels; final verification adds a bounded visual and responsive inspection.

**Tech Stack:** Electron, TypeScript, vanilla DOM/CSS, Vitest with Happy DOM, Electron Forge.

## Global Constraints

- Black, white, and gray are the editor shell palette; no purple editor accents, gradients, or glow.
- Green is reserved for healthy service status.
- Theme colors appear only in theme swatches and the Doubao preview.
- Preserve all current theme, wallpaper, persistence, restart, import/export, save/apply, and restore behaviors.
- Do not add React, Tailwind, shadcn runtime, icon packages, or any new dependency.
- Preserve all existing `data-action` names and IPC calls.
- Long helper copy must wrap inside the automatic-run settings area, never the top bar.
- Minimum supported window width remains 760px.

---

### Task 1: Restructure the editor shell and fix automation-copy placement

**Files:**
- Modify: `src/renderer/app.ts:55-92`
- Modify: `tests/renderer.test.ts`

**Interfaces:**
- Consumes: existing `DoubaoSkinApi`, `data-action` selectors, `getSkinPersistence()`, `getSkinAutomation()`, and current event listeners.
- Produces: `.app-shell`, `.topbar`, `.theme-panel`, `.stage`, `.control-panel`, `.appearance-panel`, `.automation-panel`, and `.actionbar` markup with unchanged control selectors.

- [ ] **Step 1: Write failing semantic placement tests**

Add tests which mount the real renderer and assert:

```ts
it("keeps automation controls out of the top bar", async () => {
  const root = document.createElement("div");
  await mountApp(root, api());

  expect(root.querySelector(".topbar [data-action='persistence']")).toBeNull();
  expect(root.querySelector(".topbar [data-action='confirm-before-restart']")).toBeNull();
  expect(root.querySelector(".topbar [data-action='temporarily-disable-skin']")).toBeNull();
  expect(root.querySelector(".automation-panel [data-action='persistence']")).not.toBeNull();
  expect(root.querySelector(".automation-panel [data-action='confirm-before-restart']")).not.toBeNull();
  expect(root.querySelector(".automation-panel [data-action='temporarily-disable-skin']")).not.toBeNull();
});

it("places temporary-disable guidance inside automation settings", async () => {
  const root = document.createElement("div");
  await mountApp(root, api());

  const guidance = root.querySelector(".automation-panel [data-role='temporary-disable-help']");
  expect(guidance?.textContent).toContain("暂停后台检测与开机启动");
  expect(guidance?.textContent).toContain("不删除已保存主题");
  expect(root.querySelector(".topbar")?.textContent).not.toContain("暂停后台检测与开机启动");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: both new tests fail because the three controls and guidance still live inside `.topbar__status`.

- [ ] **Step 3: Implement the approved semantic structure**

Change only the markup template in `mountApp()`:

- top bar: brand/current theme context, status dot/text, `启动 / 连接` button;
- left panel: title and existing theme list/tools;
- center: existing preview header/frame/hint;
- right inspector: `外观` and `自动运行` sections;
- move the three existing checkboxes into `.automation-panel`;
- put the existing helper copy in `[data-role="temporary-disable-help"]`;
- keep existing query selectors and all downstream event wiring unchanged;
- keep footer actions but give them semantic grouping for save/apply versus restore.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: all renderer tests pass, including existing automation read/write and persistence race tests.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/app.ts tests/renderer.test.ts
git commit -m "refactor: organize editor workspace"
```

---

### Task 2: Build the neutral responsive visual system

**Files:**
- Modify: `src/renderer/styles.css`
- Modify: `tests/renderer.test.ts`

**Interfaces:**
- Consumes: Task 1 class names and unchanged preview CSS variables.
- Produces: neutral desktop shell at default width and stable responsive layouts down to 760px.

- [ ] **Step 1: Add failing stylesheet contract tests**

Read `src/renderer/styles.css` in the test and assert the required design contracts:

```ts
it("ships the neutral responsive workspace styles", () => {
  const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
  expect(css).toContain(".automation-panel");
  expect(css).toContain("[data-role=\"temporary-disable-help\"]");
  expect(css).toContain("@media (max-width: 900px)");
  expect(css).not.toContain("#7257dd");
  expect(css).not.toContain("#7257df");
  expect(css).not.toContain("#8a62de");
  expect(css).not.toContain(".panel-title > button");
});
```

Add any necessary Node import at the top of the test file.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: failure for missing automation styles/responsive rule and current purple values.

- [ ] **Step 3: Replace shell styles without changing preview theme behavior**

Implement:

- neutral semantic variables for editor surfaces, text, borders, muted text, dark primary action, green healthy status, and red destructive text;
- top bar with one-line status/action, no automation settings;
- left theme library with restrained active state, no purple badge;
- enlarged center preview with neutral frame;
- right inspector with simple separated groups rather than nested cards;
- accessible custom switch appearance using existing checkbox inputs;
- minimum 36px buttons and at least 11px helper/body copy;
- visible `:focus-visible` treatment, themed text selection, scrollbar, hover, disabled, and active states;
- `@media (max-width: 1100px)` compact three-column layout;
- `@media (max-width: 900px)` layout that preserves top status and lets the inspector scroll without squeezing text;
- remove the dead `.panel-title > button` rule;
- do not alter `.preview*` color variables or wallpaper rendering behavior except shell sizing.

- [ ] **Step 4: Run UI detector once**

Run:

```powershell
node C:\Users\admin\.codex\skills\impeccable\scripts\detect.mjs --json src/renderer/app.ts src/renderer/styles.css
```

Fix only concrete defects reported inside the approved scope. Do not add decorative features.

- [ ] **Step 5: Verify focused tests and typecheck**

Run:

```powershell
npm.cmd test -- tests/renderer.test.ts tests/preview.test.ts
npm.cmd run typecheck
git diff --check
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/styles.css tests/renderer.test.ts
git commit -m "style: simplify neutral editor shell"
```

---

### Task 3: Release and visual acceptance

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/release-win.test.ts`

**Interfaces:**
- Consumes: completed neutral editor UI.
- Produces: Windows release `0.1.18`.

- [ ] **Step 1: Change release test expectations to 0.1.18**

Update every version assertion in `tests/release-win.test.ts` from `0.1.17` to `0.1.18`, retaining assertions for `package.json`, lockfile root, and `packages[""]`.

- [ ] **Step 2: Run the release test and verify RED**

Run: `npm.cmd test -- tests/release-win.test.ts`

Expected: version assertions fail with actual `0.1.17`.

- [ ] **Step 3: Update release metadata**

Set `version` to `0.1.18` in:

- `package.json`;
- `package-lock.json` root version;
- `package-lock.json` `packages[""]` version.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run make
git diff --check
```

Expected: all tests pass, TypeScript has no errors, and Electron Forge creates the x64 installer and zip under `out/make`.

- [ ] **Step 5: Perform bounded visual acceptance**

Inspect one default-width render and one 760px-wide render. Confirm:

- no purple editor chrome;
- no overlapping, vertical, or clipped top-bar text;
- automation guidance wraps inside the inspector;
- theme list, preview, sliders, tabs, switches, save/apply, restore, import/export remain visible and usable;
- status uses green only when healthy;
- wallpaper and theme colors remain visible inside preview/swatches.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json tests/release-win.test.ts
git commit -m "chore: release 0.1.18"
```

