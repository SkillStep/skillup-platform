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
    expect(source).toContain("LandingBanner");
    expect(source).toContain("/landing/skillup-premium-banner.jpg");
    expect(source).toContain("/landing/skillup-premium-banner-mobile.jpg");
    expect(source).toContain("Learn AI Skills through games for better earning");
    expect(source).toContain("ScrollReveal");
    expect(source).toContain("What You Can Learn");
    expect(source).toContain("aboveFold");
    expect(subscribeSource).toContain("/landing/jazzcash-logo.png");
    expect(subscribeSource).toContain("Subscribe Now");
    expect(subscribeSource).toContain("/api/v1/premium/billing/jazzcash-v11/link/start");
    expect(subscribeSource).toContain("trackAddToCart");
  });

  it("keeps banners full-width and uncropped in the landing column", () => {
    const css = readFileSync(new URL("./landing.module.css", import.meta.url), "utf8");
    const banner = readFileSync(new URL("./landing-banner.tsx", import.meta.url), "utf8");
    expect(css).toContain("width: 100% !important");
    expect(css).toContain("object-fit: contain");
    expect(css).not.toContain("object-fit: cover");
    expect(css).toContain("zoom: 0.8");
    expect(css).toMatch(/\.page\s*\{[^}]*overflow:\s*visible/);
    expect(banner).not.toContain("fill");
    expect(css).toMatch(/\.paymentCard[\s\S]*flex:\s*0\s+0\s+auto/);
  });

  it("pins banner + JazzCash to the first mobile viewport", () => {
    const css = readFileSync(new URL("./landing.module.css", import.meta.url), "utf8");
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*height:\s*100dvh/);
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\.hero[\s\S]*flex:\s*1\s+1\s+0/);
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*zoom:\s*1/);
  });

  it("keeps legal links on the landing surface", () => {
    expect(subscribeSource).toContain('href="/en/legal/terms"');
    expect(source).toContain('href="/en/legal/privacy"');
  });
});
