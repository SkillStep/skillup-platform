import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./home-payment-banner.tsx", import.meta.url), "utf8");

describe("home payment unlock popup", () => {
  it("shows Premium Features Unlocked after successful JazzCash payment", () => {
    expect(source).toContain("Premium Features Unlocked");
    expect(source).toContain('role="dialog"');
    expect(source).toContain("markPremiumUnlocked");
    expect(source).toContain('href={"/en/premium" as Route}');
  });
});
