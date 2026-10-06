import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("mainLanding2 redirect", () => {
  it("forwards visitors to the UTM landing URL structure", () => {
    expect(source).toContain("buildLandingPath");
    expect(source).toContain("normalizeLandingCampaign");
    expect(source).toContain("redirect(buildLandingPath(campaign) as Route)");
  });
});
