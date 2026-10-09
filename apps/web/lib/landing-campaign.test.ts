import { describe, expect, it } from "vitest";

import {
  buildLanding2Path,
  buildLandingPath,
  DEFAULT_LANDING_CAMPAIGN,
  LANDING2_CAMPAIGN,
  normalizeLanding2Campaign,
  normalizeLandingCampaign,
  planCodeForPackage,
} from "./landing-campaign";

describe("landing-campaign", () => {
  it("builds the client-approved mainLanding UTM URL", () => {
    expect(buildLandingPath(DEFAULT_LANDING_CAMPAIGN)).toBe(
      "/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash",
    );
  });

  it("builds the client landing2 20% off UTM URL", () => {
    expect(buildLanding2Path(LANDING2_CAMPAIGN)).toBe(
      "/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash",
    );
    expect(normalizeLanding2Campaign({})).toEqual(LANDING2_CAMPAIGN);
  });

  it("normalizes missing campaign params to defaults", () => {
    expect(normalizeLandingCampaign({ utm: "M", package: "2" })).toEqual({
      utm: "M",
      package: "2",
      parameter: "default",
      payment: "jazzcash",
    });
    expect(planCodeForPackage("default")).toBe("premium-monthly");
    expect(planCodeForPackage("2")).toBe("premium-yearly");
    expect(planCodeForPackage("9")).toBe("premium-monthly");
  });
});
