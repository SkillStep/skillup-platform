import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildLandingPath,
  normalizeLandingCampaign,
  planCodeForPackage,
} from "../../lib/landing-campaign";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const subscribeSource = readFileSync(new URL("./landing-subscribe.tsx", import.meta.url), "utf8");

describe("mainLanding campaign URL", () => {
  it("uses the client UTM structure", () => {
    expect(buildLandingPath()).toBe(
      "/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash",
    );
    expect(normalizeLandingCampaign({})).toEqual({
      utm: "D",
      package: "default",
      parameter: "default",
      payment: "jazzcash",
    });
    expect(planCodeForPackage("default")).toBe("premium-monthly");
  });
});

describe("mainLanding page", () => {
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
