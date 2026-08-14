# Official User Bubble Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Doubao's native right-aligned, content-sized user message bubble while retaining Xiaodoubao theme colors.

**Architecture:** Keep `[data-testid="send_message"]` as the outer runtime marker so adapter discovery remains stable, but never paint or resize that layout row. Apply only color-related theme properties to its descendant `[data-testid="message_text_content"]`; mirror the same ownership model in the local preview. Release the verified fix as 0.1.22.

**Tech Stack:** Electron, TypeScript, injected CSS, Vitest/jsdom, Electron Forge/Squirrel.

## Global Constraints

- Preserve the shipped adapter selector `[data-testid="send_message"]`; do not move the runtime marker back to the text node.
- Do not set background, border, shadow, width, min/max width, padding, margin, display, flex, alignment, or positioning on `.dbs-message-user`.
- On the inner message content, theme only `background`, `color`, and `border-color`; preserve Doubao's native width, padding, radius, and shadow.
- Assistant messages remain frameless.
- Do not change wallpaper, palette extraction, persistence, guardian, shortcut migration, or theme package behavior.
- Do not add dependencies.

---

### Task 1: Restore native user-message layout

**Files:**
- Modify: `src/main/injector.ts`
- Modify: `src/renderer/styles.css`
- Test: `tests/injector.test.ts`
- Test: `tests/preview.test.ts`

**Interfaces:**
- Consumes: `DoubaoAdapter.regions.messageUser = ['[data-testid="send_message"]']` and the existing `dbs-message-user` marker.
- Produces: injected CSS that paints only `[data-testid="message_text_content"]`, plus a preview that keeps the user row right-aligned without a forced minimum width.

- [ ] **Step 1: Replace the old injector regression with a failing ownership contract**

In `tests/injector.test.ts`, retain the adapter/marker test and replace the old `360px` expectation with assertions equivalent to:

```ts
expect(css).toContain('.dbs-message-user [data-testid="message_text_content"]');
const outerRule = css.match(/\.dbs-message-user\s*\{([^}]*)\}/)?.[1] ?? "";
expect(outerRule).not.toMatch(/background|border|box-shadow|width|padding|margin|display|flex|align|position/);
const innerRule = css.match(/\.dbs-message-user \[data-testid="message_text_content"\]\s*\{([^}]*)\}/)?.[1] ?? "";
expect(innerRule).toMatch(/background:/);
expect(innerRule).toMatch(/color:/);
expect(innerRule).toMatch(/border-color:/);
expect(innerRule).not.toMatch(/width|min-width|max-width|padding|margin|border-radius|box-shadow|display|flex|align|position/);
```

Keep the existing assistant assertion for transparent background, zero border, zero radius, no shadow, and zero inline padding.

- [ ] **Step 2: Add a failing preview alignment contract**

In `tests/preview.test.ts`, assert the preview CSS keeps `.preview__user { justify-content:flex-end; }`, gives `.preview__user p` the themed background/color/border-color, and does not give it `width`, `min-width`, or `max-width`. Retain the assistant no-frame assertions.

- [ ] **Step 3: Run focused tests and retain genuine RED evidence**

Run:

```powershell
npm.cmd test -- tests/injector.test.ts tests/preview.test.ts
```

Expected: failures show the current direct outer-row styling and `min-width: min(360px, 72%)` contract.

- [ ] **Step 4: Make the minimal runtime CSS change**

In `src/main/injector.ts`, delete the direct `.dbs-message-user { ... }` declaration and add only:

```css
html.doubao-skin .dbs-message-user [data-testid="message_text_content"] {
  background: color-mix(in srgb, var(--dbs-contrast-base) var(--dbs-chat-safety-mix), var(--dbs-user-bubble)) !important;
  color: inherit !important;
  border-color: var(--dbs-chat-border) !important;
}
```

Do not add any geometry or layout property to either selector.

- [ ] **Step 5: Synchronize the local preview**

In `src/renderer/styles.css`, leave the preview row right-aligned and replace the user paragraph rule with color-only properties:

```css
.preview__user { justify-content:flex-end; }
.preview__user p {
  background:color-mix(in srgb,var(--p-contrast-base) var(--p-chat-safety-mix),var(--p-user));
  color:inherit;
  border-color:var(--p-chat-border);
}
```

Remove `display`, `width`, `min-width`, `max-width`, and `overflow-wrap` from the user-specific rule. Do not change the assistant rule.

- [ ] **Step 6: Verify GREEN and static quality**

Run:

```powershell
npm.cmd test -- tests/injector.test.ts tests/preview.test.ts
npm.cmd run typecheck
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Run the Impeccable detector exactly once**

Run:

```powershell
node C:\Users\admin\.codex\skills\impeccable\scripts\detect.mjs --json --scope layout src/main/injector.ts src/renderer/styles.css
```

Record findings; fix only findings caused by this task.

- [ ] **Step 8: Commit the bounded fix**

```powershell
git add src/main/injector.ts src/renderer/styles.css tests/injector.test.ts tests/preview.test.ts
git commit -m "fix: preserve native user bubble layout"
```

---

### Task 2: Release Xiaodoubao 0.1.22

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/release-win.test.ts`

**Interfaces:**
- Consumes: the verified Task 1 commit.
- Produces: package metadata and Windows artifacts branded `小豆包`, version `0.1.22`.

- [ ] **Step 1: Make the release test fail first**

Change both version expectations in `tests/release-win.test.ts` from `0.1.21` to `0.1.22`, then run:

```powershell
npm.cmd test -- tests/release-win.test.ts
```

Expected: version assertions fail because metadata is still `0.1.21`.

- [ ] **Step 2: Update only release metadata**

Set `version` to `0.1.22` in `package.json`, `package-lock.json` root, and `package-lock.json` `packages[""]`. Preserve package name, executable name, product name, icon, and shortcut configuration.

- [ ] **Step 3: Verify release metadata and the whole project**

Run:

```powershell
npm.cmd test -- tests/release-win.test.ts
npm.cmd test
npm.cmd run typecheck
npm.cmd run make
git diff --check
```

Expected: zero test failures, successful typecheck/build, and clean diff check.

- [ ] **Step 4: Verify Windows outputs**

Confirm these files exist, are non-empty, and have a fresh modified time:

```text
out/make/squirrel.windows/x64/小豆包-Setup.exe
out/doubao-autoskin-win32-x64/小豆包.exe
```

- [ ] **Step 5: Commit the release**

```powershell
git add package.json package-lock.json tests/release-win.test.ts
git commit -m "chore: release xiaodoubao 0.1.22"
```

---

### Task 3: Review and integrate locally

**Files:**
- Review: Task 1 and Task 2 commit ranges
- Merge target: local `master`

**Interfaces:**
- Consumes: reviewed Task 1 and Task 2 commits.
- Produces: local `master` containing the approved 0.1.22 release.

- [ ] **Step 1: Run a whole-branch review**

Review the branch against `docs/superpowers/specs/2026-08-14-official-user-bubble-design.md`. Reject any direct styling of the outer user-message row or any geometry override on the inner user bubble.

- [ ] **Step 2: Re-run acceptance verification from the integration branch**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run make
git diff --check
```

- [ ] **Step 3: Merge into local master**

Merge the feature branch into local `master` without pushing or creating a remote pull request.

