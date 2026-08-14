# Native User Bubble Paint Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Xiaodoubao's remaining inner user-message paint override so Doubao renders exactly one native rounded bubble.

**Architecture:** Keep the stable outer `[data-testid="send_message"]` marker for discovery, but generate no user-message paint CSS at any depth. Preserve assistant framing behavior and all other theme regions. Release the regression fix as 0.1.23.

**Tech Stack:** Electron, TypeScript, injected CSS, Vitest/jsdom, Electron Forge/Squirrel.

## Global Constraints

- Do not change the adapter selector or add a new guessed bubble selector.
- Generate no background, border, color, radius, shadow, sizing, or positioning CSS for user messages.
- Doubao owns the complete user-bubble appearance.
- Assistant messages remain frameless.
- No dependencies or unrelated theme/runtime changes.

---

### Task 1: Remove injected user-bubble paint

**Files:**
- Modify: `src/main/injector.ts`
- Test: `tests/injector.test.ts`

**Interfaces:**
- Consumes: outer `dbs-message-user` marker attached through the existing adapter.
- Produces: a stylesheet with no direct or descendant user-message paint rule.

- [ ] Update the existing user-bubble regression test first so it requires no `.dbs-message-user` CSS rule and no descendant `message_text_content` paint rule, while retaining the outer marker and assistant-frameless assertions.
- [ ] Run `npm.cmd test -- tests/injector.test.ts` and retain genuine RED showing the current descendant background rule.
- [ ] Delete the descendant user-message CSS rule from `src/main/injector.ts`; restore the general no-forced-text-color assertion so it no longer exempts that rule.
- [ ] Run `npm.cmd test -- tests/injector.test.ts`, `npm.cmd test -- tests/preview.test.ts`, `npm.cmd run typecheck`, and `git diff --check`.
- [ ] Commit only the two authorized files with `fix: defer user bubble paint to doubao`.

---

### Task 2: Release Xiaodoubao 0.1.23

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/release-win.test.ts`

**Interfaces:**
- Consumes: reviewed Task 1 fix.
- Produces: Windows version 0.1.23 artifacts named `小豆包-Setup.exe` and `小豆包.exe`.

- [ ] Change release-test expectations to 0.1.23 first and retain RED against 0.1.22.
- [ ] Update exactly the package version plus both lockfile version fields to 0.1.23.
- [ ] Run release test, full test suite, typecheck, make, and diff check.
- [ ] Verify both Windows artifacts are fresh and non-empty.
- [ ] Commit only the three release files with `chore: release xiaodoubao 0.1.23`.

---

### Task 3: Review and merge locally

**Files:**
- Review: all commits from this plan
- Merge target: local `master`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: verified local master and formal output artifacts.

- [ ] Run independent final review against this plan and the two user screenshots.
- [ ] Run full tests, typecheck, make, and artifact checks on the feature branch.
- [ ] Fast-forward local master, rerun the same verification from master, then remove the merged worktree/branch.
