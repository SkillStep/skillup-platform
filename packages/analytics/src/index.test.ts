import { describe, expect, it } from "vitest";

import { assertSafeAnalyticsProperties } from "./index.js";

describe("analytics safety", () => {
  it("accepts bounded non-sensitive identifiers", () => {
    expect(() =>
      assertSafeAnalyticsProperties({ contentId: "skill-1", locale: "en", result: "completed" }),
    ).not.toThrow();
  });

  it("rejects credential and raw payment properties", () => {
    expect(() => assertSafeAnalyticsProperties({ token: "secret" })).toThrow(
      "Forbidden analytics property: token",
    );
    expect(() => assertSafeAnalyticsProperties({ rawResponse: {} })).toThrow(
      "Forbidden analytics property: rawResponse",
    );
  });
});
