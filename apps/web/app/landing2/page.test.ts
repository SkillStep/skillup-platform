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

  it("renders the Premium landing with 20% off offer copy", () => {
    expect(source).toContain("/landing/skillup-premium-banner.jpg");
    expect(source).toContain("20% off");
    expect(source).toContain("PKR 3,999");
    expect(source).toContain("buildLanding2Path");
    expect(source).toContain("normalizeLanding2Campaign");
    expect(source).toContain("What You Can Learn");
  });
});
