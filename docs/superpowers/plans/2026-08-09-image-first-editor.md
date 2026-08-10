# Image-First Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ordinary colour tuning, preserve advanced theme packages, and show every theme card with its own correct colours.

**Architecture:** `ThemeSummary` will carry a theme’s existing surface and accent. The renderer will use these values for the card swatch, while the editor presents a wallpaper-only control panel. Theme JSON and the injector keep their existing advanced fields for import/export and private customization.

**Tech Stack:** Electron, TypeScript, native DOM/CSS, Vitest, happy-dom.

## Global Constraints

- Only three built-in themes remain the normal-user choices.
- No normal-user colour inputs or per-region editing controls.
- Do not remove theme JSON advanced fields or import/export support.
- No injected text colour declarations.

---

### Task 1: Bind card colours to their actual theme

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/theme-store.ts`
- Modify: `src/renderer/app.ts`
- Modify: `src/renderer/styles.css`
- Test: `tests/renderer.test.ts`
- Test: `tests/theme-store.test.ts`

**Interfaces:**
- Produces: `ThemeSummary` with `surfaceColor: string` and `accentColor: string`.
- Consumes: theme `palette.surface` and `palette.accent`.

- [ ] **Step 1: Write failing tests**

Create two summaries with deliberately different literal colours. Render cards and assert each swatch has its own two-colour CSS variables. Verify the store summary exposes the same literal palette values.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm.cmd test -- tests/renderer.test.ts tests/theme-store.test.ts`

Expected: FAIL because card colours are hard-coded by `nth-child` and `ThemeSummary` lacks palette colours.

- [ ] **Step 3: Implement minimal binding**

Add `surfaceColor` and `accentColor` to the summary contract and store result. Set card CSS variables from the summary and draw its swatch from those variables. Remove positional `nth-child` swatch rules.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm.cmd test -- tests/renderer.test.ts tests/theme-store.test.ts`

Expected: PASS.

### Task 2: Make the editor wallpaper-first

**Files:**
- Modify: `src/renderer/app.ts`
- Modify: `src/renderer/styles.css`
- Test: `tests/renderer.test.ts`

**Interfaces:**
- Consumes: existing wallpaper fields `fit`, `positionX`, `positionY`, `scale`, `blur`, `brightness`.
- Produces: a single wallpaper control panel without region tabs or colour controls.

- [ ] **Step 1: Write failing test**

Mount the renderer and assert it contains the wallpaper picker but no region-tab navigation, colour input, undo action, or reset-region action.

- [ ] **Step 2: Run test to verify failure**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: FAIL because the existing page renders region tabs and undo/reset actions.

- [ ] **Step 3: Implement minimal UI reduction**

Remove region descriptors, colour descriptors, region tabs, undo/reset buttons and their handlers. Keep the wallpaper picker, fit selector, five image ranges, theme name, save, apply, restore, import/export and custom-theme deletion.

- [ ] **Step 4: Run test to verify pass**

Run: `npm.cmd test -- tests/renderer.test.ts`

Expected: PASS.

### Task 3: Verify no advanced data is lost

**Files:**
- Test: `tests/contracts.test.ts`
- Test: `tests/theme-archive.test.ts`

- [ ] **Step 1: Run archive and contract tests**

Run: `npm.cmd test -- tests/contracts.test.ts tests/theme-archive.test.ts`

Expected: PASS, proving advanced JSON fields still validate and export/import.

- [ ] **Step 2: Run complete verification**

Run: `npm.cmd test; npm.cmd run typecheck`

Expected: all tests and TypeScript pass.
