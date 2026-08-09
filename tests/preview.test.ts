// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
