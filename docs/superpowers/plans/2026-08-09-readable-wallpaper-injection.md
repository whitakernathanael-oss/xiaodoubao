# Readable Wallpaper Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make real Doubao wallpapers and colour regions visible without ever overriding system-controlled text colour.

**Architecture:** The injector will measure the rendered message foreground, select a dark or light safety base, and mount a wallpaper layer inside the adapted chat area. All custom panels mix their theme colour with that base; the preview applies the same mode from `prefers-color-scheme`.

**Tech Stack:** Electron, TypeScript, DOM/CSS injection, Vitest, happy-dom.

## Global Constraints

- Do not inject `color`, `fill`, or `caret-color` declarations.
- Use existing theme fields; no dependency or schema change.
- Wallpaper must be scoped to `chatArea` and use a safety veil plus the user overlay.
- Preserve cleanup and mutation re-marking.

---

### Task 1: Prove the injected runtime protects system text

**Files:**
- Modify: `tests/injector.test.ts`
- Modify: `src/main/injector.ts`

**Interfaces:**
- Consumes: `buildApplyExpression(theme, adapter, dataUrl, extraCss): string`
- Produces: runtime CSS which uses `--dbs-contrast-base` and mounts `#doubao-autoskin-wallpaper` in `.dbs-chat-area`.

- [ ] **Step 1: Write the failing test**

Run the real generated expression against a happy-dom fixture containing `#root`, `main`, message text, and a textarea. Assert the wallpaper element becomes a child of `main`, the style has a contrast base variable, and the style text has no `color:` declaration.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/injector.test.ts`

Expected: FAIL because wallpaper mounts on `document.body` and generated CSS overrides text colour.

- [ ] **Step 3: Write minimal implementation**

In `applyRuntime`, derive bright/dark foreground from computed chat message colour. Mount the wallpaper in the first chat area. Add a contrast veil and safe mixed surfaces, and remove every injected text colour declaration.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/injector.test.ts`

Expected: PASS.

### Task 2: Match local preview to system-controlled foreground

**Files:**
- Modify: `src/renderer/preview.ts`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/app.ts`
- Test: `tests/preview.test.ts`

**Interfaces:**
- Consumes: `renderPreview(root, theme, page, wallpaperUrl)`.
- Produces: preview root carrying `preview--light-text` or `preview--dark-text`, and controls excluding text-colour fields.

- [ ] **Step 1: Write the failing test**

Stub `window.matchMedia` as dark, render the preview, and assert the root gets `preview--light-text` and no authored text-colour variable is needed for message text.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/preview.test.ts`

Expected: FAIL because preview has no mode class.

- [ ] **Step 3: Write minimal implementation**

Choose preview mode from `prefers-color-scheme`, add matching black/white safety veils in CSS, remove text-colour fields from editor control descriptors, and leave theme persistence compatible.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/preview.test.ts`

Expected: PASS.

### Task 3: Verify integration and type safety

**Files:**
- Modify: `docs/superpowers/specs/2026-08-09-readable-wallpaper-injection.md` only if behavior differs from spec.

- [ ] **Step 1: Run targeted tests**

Run: `npm.cmd test -- tests/injector.test.ts tests/preview.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full validation**

Run: `npm.cmd test; npm.cmd run typecheck`

Expected: all tests and TypeScript pass.

- [ ] **Step 3: Perform manual real-Doubao validation**

Apply a light wallpaper while Windows is dark, inspect only element counts and injected marker, and confirm wallpaper resides in the chat area and text is readable. Restore and confirm marker removal.
