import { describe, expect, it } from "vitest";

import {
  buildCampaignAttributionReport,
  CAMPAIGN_ATTRIBUTION_SCHEMA_VERSION,
} from "./premium-campaign-attribution-report.js";
import { PremiumReportQuerySchema } from "./premium-reporting-contract.js";

describe("campaign attribution report", () => {
  const query = PremiumReportQuerySchema.parse({
    preset: "custom",
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-12T00:00:00.000Z",
    aggregation: "daily",
  });

  it("builds Basic, Detailed and Daily views from succeeded payment facts", () => {
    const report = buildCampaignAttributionReport(
      [
        {
          date: "2026-10-11",
          platform: "T",
          package: "2",
          parameter: "20percentoff",
          subscriptions: 1,
          amountMinor: 399_900,
        },
        {
          date: "2026-10-11",
          platform: "T",
          package: "2",
          parameter: "20percentoff",
          subscriptions: 1,
          amountMinor: 399_900,
        },
        {
          date: "2026-10-11",
          platform: "D",
          package: "default",
          parameter: "default",
          subscriptions: 1,
          amountMinor: 59_900,
        },
        {
          date: "2026-10-12",
          platform: "T",
          package: "2",
          parameter: "20percentoff",
          subscriptions: 1,
          amountMinor: 399_900,
        },
      ],
      query,
      new Date("2026-10-12T10:00:00.000Z"),
    );

    expect(report.reportSchemaVersion).toBe(CAMPAIGN_ATTRIBUTION_SCHEMA_VERSION);
    expect(report.timezone).toBe("Asia/Karachi");
    expect(report.totals).toEqual({ subscriptions: 4, amountMinor: 1_259_600 });

    const tiktok = report.basic.find(
      (row) =>
        row.date === "2026-10-11" &&
        row.platform === "T" &&
        row.package === "2" &&
        row.parameter === "20percentoff",
    );
    expect(tiktok?.subscriptions).toBe(2);
    expect(tiktok?.amountMinor).toBe(799_800);

    const platformX = report.detailed.platformByParameter.find(
      (row) =>
        row.date === "2026-10-11" && row.platform === "T" && row.parameter === "20percentoff",
    );
    expect(platformX?.subscriptions).toBe(2);

    const day = report.daily.find((row) => row.date === "2026-10-11");
    expect(day?.subscriptions).toBe(3);
    expect(day?.byPlatform["T"]).toBe(2);
    expect(day?.byPackage["2"]).toBe(2);
    expect(day?.byParameter["20percentoff"]).toBe(2);

    expect(report.exportRows.some((row) => row["view"] === "total")).toBe(true);
    expect(report.exportRows.some((row) => row["view"] === "basic")).toBe(true);
  });

  it("keeps none dimensions for payments without attribution and sorts basic rows", () => {
    const report = buildCampaignAttributionReport(
      [
        {
          date: "2026-10-12",
          platform: "none",
          package: "none",
          parameter: "none",
          subscriptions: 1,
          amountMinor: 100,
        },
        {
          date: "2026-10-11",
          platform: "Meta",
          package: "default",
          parameter: "Ranchers",
          subscriptions: 2,
          amountMinor: 200,
        },
      ],
      query,
    );

    expect(report.basic[0]?.date).toBe("2026-10-11");
    expect(report.basic[1]?.platform).toBe("none");
    expect(report.totals.subscriptions).toBe(3);
  });
});
