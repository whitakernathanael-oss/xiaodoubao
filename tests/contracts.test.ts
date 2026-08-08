import { describe, expect, it } from "vitest";
import { isThemeId } from "../src/shared/contracts";

describe("isThemeId", () => {
  it("accepts lowercase kebab-case only", () => {
    expect(isThemeId("clean-light")).toBe(true);
    expect(isThemeId("Clean Light")).toBe(false);
    expect(isThemeId("../escape")).toBe(false);
  });
});
