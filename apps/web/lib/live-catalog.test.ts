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
  levelCount: 2,
  moduleCount: 2,
  modules: ["Clean Data", "Formulas"],
  levels: [
    {
      id: "b87c0957-ff8e-4fb1-8b5f-563dc47ee049",
      title: "Clean and check order records",
      moduleId: "5134ab3e-c2ee-4cb3-b698-b5768a298d1d",
      moduleTitle: "Clean Data",
      estimatedMinutes: 8,
    },
    {
      id: "73a1d24e-bced-4630-8fd2-92844f39e949",
      title: "Calculate category totals",
      moduleId: "ad9da431-0f46-4768-885f-f7b88ff9a8e1",
      moduleTitle: "Formulas",
      estimatedMinutes: 10,
    },
  ],
  outcomes: ["Calculate a category total accurately"],
  challengeTypes: ["Multiple choice", "Scenario decisions"],
  estimatedMinutes: 18,
};

describe("authoritative published catalogue projection", () => {
  it("adds new published courses without inventing reviewer approval or count", () => {
    const courses = projectPublishedPublicSkills({ courses: [example] });
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({
      slug: "excel-for-work",
      status: "launch",
      levelCount: 2,
      moduleCount: 2,
      estimatedMinutes: 18,
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

  it("rejects invented published-level counts, wrong IDs and duplicate level records", () => {
    expect(projectPublishedPublicSkills({ courses: [{ ...example, levelCount: 3 }] })).toEqual([]);
    expect(
      projectPublishedPublicSkills({
        courses: [
          {
            ...example,
            levels: [{ ...example.levels[0], id: "unpublished-level" }, example.levels[1]],
          },
        ],
      }),
    ).toEqual([]);
    expect(
      projectPublishedPublicSkills({
        courses: [{ ...example, levels: [example.levels[0], example.levels[0]] }],
      }),
    ).toEqual([]);
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
    expect(course?.levelCount).toBe(2);
    expect(course?.levels?.map((level) => level.title)).toEqual([
      "Clean and check order records",
      "Calculate category totals",
    ]);
    expect(await loadPublishedPublicSkill("unknown/course", fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
