import { describe, expect, it } from "vitest";

import {
  buildLandingPath,
  DEFAULT_LANDING_CAMPAIGN,
  normalizeLandingCampaign,
  planCodeForPackage,
} from "./landing-campaign";

describe("landing-campaign", () => {
  it("builds the client-approved mainLanding UTM URL", () => {
    expect(buildLandingPath(DEFAULT_LANDING_CAMPAIGN)).toBe(
      "/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash",
    );
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
