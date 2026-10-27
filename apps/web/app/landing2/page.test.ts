import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildLanding2Path,
  LANDING2_CAMPAIGN,
  normalizeLanding2Campaign,
  planCodeForPackage,
} from "../../lib/landing-campaign";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("landing2 20% off campaign", () => {
  it("uses the client landing2 UTM structure", () => {
    expect(buildLanding2Path(LANDING2_CAMPAIGN)).toBe(
      "/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash",
    );
    expect(normalizeLanding2Campaign({})).toEqual(LANDING2_CAMPAIGN);
    expect(planCodeForPackage("2")).toBe("premium-yearly");
  });

  it("renders the Premium landing with shared JazzCash notice", () => {
    const subscribe = readFileSync(
      new URL("../mainLanding/landing-subscribe.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("LandingBanner");
    expect(source).toContain("/landing/tiktok-campaign-banner-web.jpg");
    expect(source).toContain("/landing/tiktok-campaign-banner-mobile-v3.jpg");
    expect(source).toContain("20% off");
    expect(source).not.toContain("offerNotice");
    expect(subscribe).toContain(
      "Subscribe Now click kertay he Rs.1 kat lia jae ga. Ye limited offer sirf aj k din k liye valid hai. Us k bad PKR 599/m lago hun gay.",
    );
    expect(source).toContain("buildLanding2Path");
    expect(source).toContain("normalizeLanding2Campaign");
    expect(source).toContain("What You Can Learn");
  });
});
