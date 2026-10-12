import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./landing-subscribe.tsx", import.meta.url), "utf8");

describe("landing Subscribe Now pay-first flow", () => {
  it("starts JazzCash wallet-link without forcing sign-in first", () => {
    expect(source).toContain("/api/v1/premium/billing/jazzcash-v11/link/start");
    expect(source).toContain("Pay-first");
    // Bypass still requires auth; JazzCash wallet-link must not branch on 401.
    const jazzCashBlock = source.slice(
      source.indexOf('fetch("/api/v1/premium/billing/jazzcash-v11/link/start"'),
    );
    expect(jazzCashBlock).not.toContain("response.status === 401");
  });

  it("sends campaign attribution on JazzCash wallet-link start", () => {
    expect(source).toContain('from "../../lib/utm-attribution"');
    expect(source).toContain("attributionForBilling");
    const jazzCashBlock = source.slice(
      source.indexOf('fetch("/api/v1/premium/billing/jazzcash-v11/link/start"'),
    );
    expect(jazzCashBlock).toContain("attribution");
  });

  it("fires GA4 add_to_cart before JazzCash handoff", () => {
    expect(source).toContain("trackAddToCart");
    expect(source).toContain("buildLandingAnalyticsContext");
  });

  it("posts backend funnel events on Subscribe Now", () => {
    expect(source).toContain("postPremiumFunnelEvent");
    expect(source).toContain('"plan_selected"');
    expect(source).toContain('"add_to_cart"');
  });
});
