// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderPreview } from "../src/renderer/preview";
import { DEFAULT_THEME } from "../src/shared/defaults";

afterEach(() => vi.unstubAllGlobals());

describe("preview readability", () => {
  it("uses the dark-system safety surface instead of authored text colour", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const root = document.createElement("div");

    renderPreview(root, DEFAULT_THEME, "chat");

    expect(root.classList.contains("preview--light-text")).toBe(true);
    expect(root.style.getPropertyValue("--p-contrast-base")).toBe("#000000");
    expect(root.style.getPropertyValue("--p-chat-text")).toBe("");
  });

  it("keeps a selected wallpaper visible behind the chat preview", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const root = document.createElement("div");
    const theme = structuredClone(DEFAULT_THEME);
    theme.regions.sidebar.opacity = 0.72;

    renderPreview(root, theme, "chat", "blob:selected-wallpaper");

    expect(root.style.getPropertyValue("--p-wallpaper")).toContain("blob:selected-wallpaper");
    expect(root.style.getPropertyValue("--p-chat-layer")).toBe("transparent");
    expect(root.style.getPropertyValue("--p-sidebar-alpha")).toBe("72%");
    expect(root.style.getPropertyValue("--p-sidebar-layer")).toContain("transparent");
    expect(root.style.getPropertyValue("--p-sidebar-layer")).toContain("--p-contrast-base");
    const css = readFileSync(path.resolve("src/renderer/styles.css"), "utf8");
    expect(css).toMatch(
      /\.preview__chat\s*\{[^}]*background\s*:\s*var\(--p-chat-layer\)/
    );
    expect(css).toMatch(/\.preview__sidebar[^}]*background\s*:\s*var\(--p-sidebar-layer\)/);
    expect(css).toMatch(/\.preview__sidebar[^}]*backdrop-filter\s*:\s*blur\(/);

    renderPreview(root, theme, "chat");
    expect(root.style.getPropertyValue("--p-wallpaper")).toBe("");
    expect(root.style.getPropertyValue("--p-chat-layer")).not.toBe("transparent");
  });

  it("matches native chat treatment for preview assistant and user messages", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const root = document.createElement("div");
    renderPreview(root, DEFAULT_THEME, "chat");
    const css = readFileSync(path.resolve("src/renderer/styles.css"), "utf8");

    expect(css).toMatch(/\.preview__user\s*\{\s*justify-content:flex-end;\s*\}/);
    expect(css).toMatch(/\.preview__user p\s*\{[^}]*background:color-mix\(in srgb,var\(--p-contrast-base\) var\(--p-chat-safety-mix\),var\(--p-user\)\);[^}]*color:inherit;[^}]*border-color:var\(--p-chat-border\);/);
    expect(css).not.toMatch(/\.preview__user p\s*\{[^}]*\b(?:display|width|min-width|max-width|overflow-wrap|padding|margin|border-radius|box-shadow)\s*:/);
    expect(css).toMatch(/\.preview__assistant p\s*\{[^}]*background:transparent !important;[^}]*border:0 !important;[^}]*border-radius:0 !important;[^}]*box-shadow:none !important;[^}]*padding-inline:0 !important;/);
  });
});
