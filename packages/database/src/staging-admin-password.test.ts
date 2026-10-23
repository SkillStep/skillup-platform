import { describe, expect, it } from "vitest";

import { resolveStagingOperatorPassword } from "./staging-admin-password.js";

describe("staging Admin password configuration", () => {
  it("disables password login when the protected secret is missing or short", () => {
    expect(resolveStagingOperatorPassword(undefined)).toBeNull();
    expect(resolveStagingOperatorPassword("")).toBeNull();
    expect(resolveStagingOperatorPassword("short-placeholder")).toBeNull();
  });

  it("only enables password login for a configured sufficiently long secret", () => {
    expect(resolveStagingOperatorPassword("  synthetic-long-test-password-for-qa  ")).toBe(
      "synthetic-long-test-password-for-qa",
    );
  });
});
