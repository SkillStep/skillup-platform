import { describe, expect, it, vi } from "vitest";

import {
  loadPublishedPublicSkill,
  loadPublishedPublicSkills,
  projectPublishedPublicSkills,
} from "./live-catalog";

const example = {
  slug: "excel-for-work",
  pathSlug: "excel-for-work",
  title: "Excel for Work",
  summary: "Practice real spreadsheet skills and create a reusable business tracker.",
  levelId: "b87c0957-ff8e-4fb1-8b5f-563dc47ee049",
  levelCount: 24,
  moduleCount: 4,
  modules: ["Clean Data", "Formulas", "Charts", "Project"],
  outcomes: ["Calculate a category total accurately"],
  challengeTypes: ["Multiple choice", "Scenario decisions"],
  estimatedMinutes: 180,
};

describe("authoritative published catalogue projection", () => {
  it("adds new published courses without inventing reviewer approval or count", () => {
    const courses = projectPublishedPublicSkills({ courses: [example] });
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({
      slug: "excel-for-work",
      status: "launch",
      levelCount: 24,
      moduleCount: 4,
      estimatedMinutes: 180,
    });
    expect(courses[0]?.editorialNote).toBeNull();
  });

  it("never makes invalid, duplicate or incomplete course records visible", () => {
    const courses = projectPublishedPublicSkills({
      courses: [
        { ...example, levelCount: 0 },
        example,
        example,
        { ...example, slug: "draft-placeholder", levelId: "not-a-uuid" },
      ],
    });
    expect(courses).toHaveLength(1);
  });

  it("fails closed when catalogue API cannot be reached", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await loadPublishedPublicSkills(fetcher)).toEqual([]);
    expect(await loadPublishedPublicSkill("excel-for-work", fetcher)).toBeNull();
  });

  it("loads a published course with exact API data and rejects unknown slugs", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ courses: [example] }),
    });
    const course = await loadPublishedPublicSkill("excel-for-work", fetcher);
    expect(course?.levelCount).toBe(24);
    expect(await loadPublishedPublicSkill("unknown/course", fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
