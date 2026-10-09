import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./home-payment-banner.tsx", import.meta.url), "utf8");

describe("home payment status message", () => {
  it("shows a simple success message without a Premium Features modal CTA", () => {
    expect(source).toContain("Premium Features Unlocked");
    expect(source).toContain('role="status"');
    expect(source).toContain("markPremiumUnlocked");
    expect(source).not.toContain('role="dialog"');
    expect(source).not.toContain("Open Premium Features");
    expect(source).not.toContain('href={"/en/premium" as Route}');
  });
});
