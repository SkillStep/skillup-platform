import { describe, expect, it } from "vitest";

import { publicPolicies } from "./public-policies";

describe("public launch policies", () => {
  it("publishes the approved launch policy version", () => {
    expect(publicPolicies).not.toHaveLength(0);
    expect(publicPolicies.every((policy) => policy.version === "2026-09-03")).toBe(true);
  });

  it("contains no provisional or work-in-progress wording", () => {
    const copy = JSON.stringify(publicPolicies).toLowerCase();
    expect(copy).not.toContain("provisional");
    expect(copy).not.toContain("work in progress");
    expect(copy).not.toContain("wip");
    expect(copy).not.toContain("tbd");
  });

  it("gives learners a concrete refund-review route", () => {
    const refund = publicPolicies.find((policy) => policy.key === "refund");
    expect(refund).toBeDefined();
    expect(JSON.stringify(refund)).toContain("SkillUp support page");
    expect(JSON.stringify(refund)).toContain("merchant reference");
    expect(JSON.stringify(refund)).toContain("provider reference");
  });
});
