import { describe, expect, it } from "vitest";

import { featuredPath, launchPaths } from "./home-content";

describe("launch path content", () => {
  it("contains one pilot and stable unique slugs", () => {
    expect(launchPaths.filter((path) => path.status === "pilot")).toHaveLength(1);
    expect(new Set(launchPaths.map((path) => path.slug)).size).toBe(launchPaths.length);
  });

  it("selects the interview and workplace communication pilot", () => {
    expect(featuredPath().slug).toBe("interview-workplace-communication");
  });
});
