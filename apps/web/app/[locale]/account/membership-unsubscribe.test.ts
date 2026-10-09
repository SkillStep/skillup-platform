import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./membership-account.tsx", import.meta.url), "utf8");

describe("Premium unsubscribe profile lock", () => {
  it("does not treat unsubscribe 409 as a successful redirect", () => {
    expect(source).toContain("entitlementBody.cancelled !== true");
    expect(source).toContain("No active Premium subscription was found to unsubscribe");
    expect(source).not.toContain(
      "if (!entitlementResponse.ok && entitlementResponse.status !== 409)",
    );
  });

  it("treats Premium Active from entitlement only", () => {
    expect(source).toContain(
      'const premiumActive = Boolean(entitlement && ["active", "grace"].includes(entitlement.status));',
    );
    expect(source).toContain("entitlement-authoritative");
  });
});
