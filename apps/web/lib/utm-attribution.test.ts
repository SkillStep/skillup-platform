import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attributionFromLandingCampaign,
  buildPremiumAttribution,
  captureLandingAttribution,
  readStoredAttribution,
  UTM_ATTRIBUTION_STORAGE_KEY,
} from "./utm-attribution";

describe("utm attribution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies utm into utm_source when utm_source is empty", () => {
    expect(
      buildPremiumAttribution({
        utm: "T",
        package: "2",
        parameter: "20percentoff",
        payment: "jazzcash",
      }),
    ).toEqual({
      utm: "T",
      utm_source: "T",
      package: "2",
      parameter: "20percentoff",
      payment: "jazzcash",
    });
  });

  it("clips landingPath to 120 characters", () => {
    const longPath = `/landing2?${"x".repeat(200)}`;
    const result = buildPremiumAttribution({ landingPath: longPath });
    expect(result.landingPath?.length).toBe(120);
  });

  it("builds attribution from a landing campaign", () => {
    expect(
      attributionFromLandingCampaign(
        { utm: "T", package: "2", parameter: "20percentoff", payment: "jazzcash" },
        {
          landing: "landing2",
          landingPath: "/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash",
        },
      ),
    ).toMatchObject({
      utm: "T",
      utm_source: "T",
      package: "2",
      parameter: "20percentoff",
      payment: "jazzcash",
      landing: "landing2",
    });
  });

  it("persists and reads attribution from localStorage within TTL", () => {
    const store = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("localStorage", localStorage);

    captureLandingAttribution(
      { utm: "D", package: "default", parameter: "default", payment: "jazzcash" },
      {
        landing: "mainLanding",
        landingPath: "/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash",
      },
    );

    expect(store.has(UTM_ATTRIBUTION_STORAGE_KEY)).toBe(true);
    expect(readStoredAttribution()).toMatchObject({
      utm: "D",
      utm_source: "D",
      package: "default",
      parameter: "default",
      landing: "mainLanding",
    });
  });
});
