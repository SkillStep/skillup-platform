import { describe, expect, it } from "vitest";

import { featuredPath, launchPaths } from "./home-content";

describe("launch path content", () => {
  it("contains one pilot and stable unique slugs", () => {
    expect(launchPaths.filter((path) => path.status === "pilot")).toHaveLength(1);
    expect(new Set(launchPaths.map((path) => path.slug)).size).toBe(launchPaths.length);
  });

  it("selects the playable interview and workplace communication pilot", () => {
    expect(featuredPath()).toMatchObject({
      slug: "interview-workplace-communication",
      levelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    });
  });

  it("does not expose unreviewed paths as playable", () => {
    expect(
      launchPaths.filter((path) => path.status === "planned").every((path) => !path.levelId),
    ).toBe(true);
  });
});
