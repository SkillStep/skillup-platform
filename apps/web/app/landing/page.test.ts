import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildLandingPath,
  normalizeLandingCampaign,
  planCodeForPackage,
} from "../../lib/landing-campaign";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const subscribeSource = readFileSync(new URL("./landing-subscribe.tsx", import.meta.url), "utf8");

describe("landing campaign URL", () => {
  it("uses the doc UTM structure", () => {
    expect(buildLandingPath()).toBe("/landing?utm=M&package=1&parameter=premium");
    expect(normalizeLandingCampaign({})).toEqual({
      utm: "M",
      package: "1",
      parameter: "premium",
    });
    expect(planCodeForPackage("1")).toBe("premium-monthly");
  });
});

describe("landing page", () => {
  it("renders the SkillUp Premium design", () => {
    expect(source).toContain("/landing/skillup-premium-banner.jpg");
    expect(source).toContain("Learn AI Skills through games for better earning");
    expect(source).toContain("ScrollReveal");
    expect(source).toContain("What You Can Learn");
    expect(subscribeSource).toContain("/landing/jazzcash-logo.png");
    expect(subscribeSource).toContain("Subscribe Now");
    expect(subscribeSource).toContain("/api/v1/premium/billing/jazzcash-v11/link/start");
  });

  it("keeps legal links on the landing surface", () => {
    expect(subscribeSource).toContain('href="/en/legal/terms"');
    expect(source).toContain('href="/en/legal/privacy"');
  });
});
