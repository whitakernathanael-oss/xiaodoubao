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

  it("matches native chat treatment for preview assistant and user messages", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const root = document.createElement("div");
    renderPreview(root, DEFAULT_THEME, "chat");
    const css = readFileSync(path.resolve("src/renderer/styles.css"), "utf8");

    expect(css).toMatch(/\.preview__user p\s*\{[^}]*display:block;[^}]*width:fit-content;[^}]*min-width:min\(280px,72%\);[^}]*max-width:min\(72%,760px\);[^}]*overflow-wrap:anywhere;/);
    expect(css).toMatch(/\.preview__assistant p\s*\{[^}]*background:transparent !important;[^}]*border:0 !important;[^}]*border-radius:0 !important;[^}]*box-shadow:none !important;[^}]*padding-inline:0 !important;/);
  });
});
