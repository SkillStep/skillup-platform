import { describe, expect, it } from "vitest";

import { buildCampaignAttributionSpreadsheetXml } from "./campaign-attribution-xlsx";

describe("campaign attribution spreadsheet", () => {
  it("emits alternating grey/white Excel styles", () => {
    const xml = buildCampaignAttributionSpreadsheetXml({
      detailed: {
        platformByParameter: [
          { date: "2026-10-14", platform: "T", parameter: "20percentoff", subscriptions: 2 },
        ],
        packageByParameter: [],
      },
      daily: [],
    });
    expect(xml).toContain('ss:ID="Header"');
    expect(xml).toContain('ss:ID="Odd"');
    expect(xml).toContain('ss:Color="#E8EAED"');
    expect(xml).toContain("20percentoff");
  });
});
