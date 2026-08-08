import { describe, expect, it } from "vitest";
import { validateExtraCss } from "../src/main/css-validator";

describe("extra.css validation", () => {
  it("allows rules anchored to the active theme", () => {
    const result = validateExtraCss(
      `html.doubao-skin.theme-clean-light .dbs-sidebar { opacity: .8 }
       @media (max-width: 900px) {
         :root.doubao-skin.theme-clean-light .dbs-chat { border-radius: 8px }
       }`,
      "clean-light"
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    "body { color: red }",
    "@import 'https://example.com/x.css';",
    "html.doubao-skin.theme-clean-light { background: url(https://example.com/x) }",
    "html.doubao-skin.theme-clean-light { width: expression(alert(1)) }",
    "html.doubao-skin.theme-clean-light { behavior: url(x.htc) }",
    "html.doubao-skin.theme-clean-light { background: u/**/rl(https://example.com/x) }",
    "@supports (background: url(https://example.com/x)) { html.doubao-skin.theme-clean-light { opacity: .8 } }",
    "html.doubao-skin.theme-clean-light, body { color: red }"
  ])("rejects unsafe CSS: %s", (css) => {
    expect(validateExtraCss(css, "clean-light").ok).toBe(false);
  });

  it("returns a safe rejection for malformed CSS", () => {
    expect(() => validateExtraCss(
      "html.doubao-skin.theme-clean-light { color: red",
      "clean-light"
    )).not.toThrow();
    expect(validateExtraCss(
      "html.doubao-skin.theme-clean-light { color: red",
      "clean-light"
    ).ok).toBe(false);
  });
});
