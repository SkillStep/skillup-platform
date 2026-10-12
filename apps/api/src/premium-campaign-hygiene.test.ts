import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CampaignHygieneInputSchema,
  isOmittedFromCampaignReport,
} from "./premium-campaign-hygiene.js";

describe("campaign hygiene helpers", () => {
  it("detects omitFromCampaignReport on attribution objects", () => {
    expect(isOmittedFromCampaignReport({ omitFromCampaignReport: true })).toBe(true);
    expect(isOmittedFromCampaignReport({ utm: "T", omitFromCampaignReport: false })).toBe(false);
    expect(isOmittedFromCampaignReport({ utm: "T" })).toBe(false);
    expect(isOmittedFromCampaignReport(null)).toBe(false);
  });

  it("accepts omit by orderIds or match filters", () => {
    expect(
      CampaignHygieneInputSchema.parse({
        action: "omit",
        reason: "Hide staging QA TikTok test charges",
        match: { preset: "last_7_days", platform: "T", parameter: "20percentoff" },
      }).action,
    ).toBe("omit");

    expect(
      CampaignHygieneInputSchema.parse({
        action: "restore",
        reason: "Restore partner Ranchers rows",
        orderIds: ["00000000-0000-4000-8000-000000000001"],
      }).orderIds,
    ).toHaveLength(1);
  });

  it("rejects hygiene requests without targets", () => {
    expect(() =>
      CampaignHygieneInputSchema.parse({
        action: "omit",
        reason: "missing targets",
      }),
    ).toThrow();
  });
});

describe("campaign hygiene route wiring", () => {
  it("registers hygiene and order list endpoints", () => {
    const source = readFileSync(new URL("./premium-reporting-routes.ts", import.meta.url), "utf8");
    expect(source).toContain('"/v1/admin/reports/premium/campaign-attribution/hygiene"');
    expect(source).toContain('"/v1/admin/reports/premium/campaign-attribution/orders"');
  });
});
