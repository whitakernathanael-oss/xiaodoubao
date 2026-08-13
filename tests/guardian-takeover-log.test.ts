import { describe, expect, it } from "vitest";
import { guardianTakeoverFailure } from "../src/main/guardian-takeover-log";

describe("guardian takeover logging", () => {
  it("returns the privacy-safe failure event for an Error", () => {
    expect(guardianTakeoverFailure(new TypeError("secret path"))).toEqual({
      stage: "guardian-takeover",
      errorType: "TypeError",
      status: "failed"
    });
  });

  it("uses unknown for non-Error failures", () => {
    expect(guardianTakeoverFailure({ themeId: "secret-theme", path: "secret-path" })).toEqual({
      stage: "guardian-takeover",
      errorType: "unknown",
      status: "failed"
    });
  });
});
