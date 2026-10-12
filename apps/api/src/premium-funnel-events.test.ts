import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { sanitizeFunnelMetadata } from "./premium-funnel-events.js";

describe("sanitizeFunnelMetadata", () => {
  it("strips PII-like keys and clips strings", () => {
    expect(
      sanitizeFunnelMetadata({
        surface: "landing2",
        otp: "123456",
        msisdn: "03123456789",
        token: "secret",
        note: "x".repeat(200),
      }),
    ).toEqual({
      surface: "landing2",
      note: "x".repeat(120),
    });
  });

  it("rejects non-objects", () => {
    expect(sanitizeFunnelMetadata(null)).toEqual({});
    expect(sanitizeFunnelMetadata(["a"])).toEqual({});
  });
});

describe("premium funnel route wiring", () => {
  it("registers analytics event ingest routes", () => {
    const source = readFileSync(new URL("./premium-funnel-events.ts", import.meta.url), "utf8");
    expect(source).toContain('"/v1/premium/analytics/events"');
    expect(source).toContain('"/v1/premium/events"');
    expect(source).toContain("paywall_viewed");
    expect(source).toContain("plan_selected");
    expect(source).toContain("add_to_cart");
  });

  it("registers funnel routes from the API entrypoint", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("registerPremiumFunnelEventRoutes");
  });
});
