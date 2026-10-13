import { describe, expect, it } from "vitest";

import { buildCampaignAttributionCsv } from "./campaign-attribution-csv";

describe("buildCampaignAttributionCsv", () => {
  it("emits Maidan-style date/view/platform/parameter/package/count rows", () => {
    const csv = buildCampaignAttributionCsv({
      detailed: {
        platformByParameter: [
          { date: "2026-10-08", platform: "T", parameter: "20percentoff", subscriptions: 2 },
        ],
        packageByParameter: [
          { date: "2026-10-08", package: "2", parameter: "20percentoff", subscriptions: 2 },
        ],
      },
      daily: [
        {
          date: "2026-10-08",
          byPlatform: { T: 2, none: 1 },
          byPackage: { "2": 2 },
          byParameter: { "20percentoff": 2 },
        },
      ],
    });

    expect(csv).toContain("date,view,platform,parameter,package,count");
    expect(csv).toContain("2026-10-08,platform_parameter,T,20percentoff,,2");
    expect(csv).toContain("2026-10-08,package_parameter,,20percentoff,2,2");
    expect(csv).toContain("2026-10-08,platform,T,,,2");
    expect(csv).toContain("2026-10-08,package,,,2,2");
    expect(csv).toContain("2026-10-08,parameter,,20percentoff,,2");
    expect(csv).not.toContain(",none,");
  });
});
