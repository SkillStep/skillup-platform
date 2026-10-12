import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("campaign attribution route wiring", () => {
  it("registers the admin campaign-attribution report endpoint", () => {
    const source = readFileSync(new URL("./premium-reporting-routes.ts", import.meta.url), "utf8");
    expect(source).toContain('"/v1/admin/reports/premium/campaign-attribution"');
    expect(source).toContain("campaignAttribution");
  });

  it("exposes campaign attribution on the reporting service", () => {
    const source = readFileSync(new URL("./premium-reporting-service.ts", import.meta.url), "utf8");
    expect(source).toContain("campaignAttribution: queryService.campaignAttribution");
  });
});
