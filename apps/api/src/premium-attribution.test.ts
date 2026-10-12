import { describe, expect, it } from "vitest";

import {
  PremiumAttributionInputSchema,
  sanitizePremiumAttribution,
} from "./premium-attribution.js";

describe("sanitizePremiumAttribution", () => {
  it("returns empty object for non-objects", () => {
    expect(sanitizePremiumAttribution(null)).toEqual({});
    expect(sanitizePremiumAttribution(undefined)).toEqual({});
    expect(sanitizePremiumAttribution(["utm", "T"])).toEqual({});
    expect(sanitizePremiumAttribution("Tiktok")).toEqual({});
  });

  it("allowlists keys and copies utm to utm_source", () => {
    expect(
      sanitizePremiumAttribution({
        utm: "T",
        package: "2",
        parameter: "20percentoff",
        payment: "jazzcash",
        landing: "landing2",
        landingPath: "/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash",
        otp: "123456",
        msisdn: "03123456789",
      }),
    ).toEqual({
      utm: "T",
      utm_source: "T",
      package: "2",
      parameter: "20percentoff",
      payment: "jazzcash",
      landing: "landing2",
      landingPath: "/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash",
    });
  });

  it("clips string lengths", () => {
    const result = sanitizePremiumAttribution({
      utm: "x".repeat(100),
      landingPath: "y".repeat(200),
    });
    expect(result.utm?.length).toBe(80);
    expect(result.utm_source?.length).toBe(80);
    expect(result.landingPath?.length).toBe(120);
  });

  it("preserves omitFromCampaignReport when boolean", () => {
    expect(
      sanitizePremiumAttribution({
        utm: "T",
        omitFromCampaignReport: true,
      }),
    ).toEqual({
      utm: "T",
      utm_source: "T",
      omitFromCampaignReport: true,
    });
  });
});

describe("PremiumAttributionInputSchema", () => {
  it("accepts empty and campaign-shaped bodies", () => {
    expect(PremiumAttributionInputSchema.parse({})).toEqual({});
    expect(
      PremiumAttributionInputSchema.parse({
        utm: "D",
        package: "default",
        parameter: "default",
        payment: "jazzcash",
        landing: "mainLanding",
      }),
    ).toMatchObject({
      utm: "D",
      package: "default",
      parameter: "default",
      payment: "jazzcash",
      landing: "mainLanding",
    });
  });

  it("rejects unknown client keys", () => {
    expect(() =>
      PremiumAttributionInputSchema.parse({
        utm: "T",
        otp: "123456",
      }),
    ).toThrow();
  });
});
