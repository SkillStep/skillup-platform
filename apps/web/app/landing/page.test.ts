import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("landing redirect", () => {
  it("forwards to the client mainLanding UTM URL", () => {
    expect(source).toContain("buildLandingPath");
    expect(source).toContain("normalizeLandingCampaign");
    expect(source).toContain("redirect(buildLandingPath(campaign) as Route)");
  });
});
