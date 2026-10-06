import { describe, expect, it } from "vitest";

import {
  buildLandingPath,
  DEFAULT_LANDING_CAMPAIGN,
  normalizeLandingCampaign,
  planCodeForPackage,
} from "./landing-campaign";

describe("landing-campaign", () => {
  it("builds the documented UTM landing URL", () => {
    expect(buildLandingPath(DEFAULT_LANDING_CAMPAIGN)).toBe(
      "/landing?utm=M&package=1&parameter=premium",
    );
  });

  it("normalizes missing campaign params to defaults", () => {
    expect(normalizeLandingCampaign({ utm: "FB", package: "2" })).toEqual({
      utm: "FB",
      package: "2",
      parameter: "premium",
    });
    expect(planCodeForPackage("2")).toBe("premium-yearly");
    expect(planCodeForPackage("9")).toBe("premium-monthly");
  });
});
