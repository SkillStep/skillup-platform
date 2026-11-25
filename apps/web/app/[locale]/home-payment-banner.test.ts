import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./home-payment-banner.tsx", import.meta.url), "utf8");

describe("home payment status message", () => {
  it("shows a guest Sign up / Sign in dialog after JazzCash success", () => {
    expect(source).toContain("Premium Features Unlocked");
    expect(source).toContain("markPremiumUnlocked");
    expect(source).toContain('role="dialog"');
    expect(source).toContain("Sign up");
    expect(source).toContain("Sign in");
    expect(source).toContain("response.status === 401");
    expect(source).not.toContain("Open Premium Features");
    expect(source).not.toContain('href={"/en/premium" as Route}');
  });

  it("verifies conversion receipt before Subscribe (§3A)", () => {
    expect(source).toContain("/api/campaign/conversion-receipt");
    expect(source).toContain("conversionReceipt");
    expect(source).toContain("receiptVerified");
    expect(source).toContain('verifyResult === "rejected"');
    expect(source).toContain('url.searchParams.delete("cv")');
  });
});
