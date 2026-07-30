import { describe, expect, it } from "vitest";

import { SkillSummarySchema } from "./index.js";

const validSkill = {
  id: "0d7d414a-4580-47d6-a6df-b0e0c1b8400e",
  slug: "interview-workplace-communication",
  locale: "en",
  title: "Interview and Workplace Communication",
  summary:
    "Practice evidence-based interview answers, professional messages and difficult workplace conversations.",
  status: "published",
  version: 1,
  reviewedAt: "2026-07-30T00:00:00.000Z",
} as const;

describe("learning content schemas", () => {
  it("accepts a reviewed published skill summary", () => {
    expect(SkillSummarySchema.parse(validSkill)).toMatchObject({ version: 1, locale: "en" });
  });

  it("rejects unstable or invalid public slugs", () => {
    expect(SkillSummarySchema.safeParse({ ...validSkill, slug: "Interview Skill" }).success).toBe(
      false,
    );
  });
});
