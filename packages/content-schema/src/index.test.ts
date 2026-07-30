import { describe, expect, it } from "vitest";

import {
  PublicChallengeSchema,
  SkillSummarySchema,
  assertAcyclicPrerequisites,
  canTransitionEditorialState,
} from "./index.js";

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

const baseChallenge = {
  id: "11111111-1111-4111-8111-111111111111",
  versionId: "11111111-1111-4111-8111-111111111112",
  contentVersion: 1,
  locale: "en",
  slug: "strongest-evidence",
  type: "multiple_choice",
  prompt: "Which response gives the strongest evidence in an interview?",
  instruction: "Choose one answer.",
  points: 10,
  selectionLimit: 1,
  options: [
    { key: "claim", label: "I work hard and learn quickly." },
    {
      key: "evidence",
      label: "I reduced weekly reporting time by creating a reusable template.",
    },
  ],
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

describe("public challenge contracts", () => {
  it("accepts a complete learner-safe challenge without an answer key", () => {
    expect(PublicChallengeSchema.parse(baseChallenge)).toEqual(baseChallenge);
  });

  it("strips protected evaluation fields from public payloads", () => {
    const parsed = PublicChallengeSchema.parse({
      ...baseChallenge,
      correctOptionKey: "evidence",
      privateEvaluation: { correctOptionKeys: ["evidence"] },
    });

    expect(parsed).not.toHaveProperty("correctOptionKey");
    expect(parsed).not.toHaveProperty("privateEvaluation");
  });

  it("rejects incomplete choice challenges", () => {
    const result = PublicChallengeSchema.safeParse({
      ...baseChallenge,
      options: [{ key: "only", label: "Only one option" }],
    });

    expect(result.success).toBe(false);
  });
});

describe("editorial workflow", () => {
  it("allows reviewed publication and controlled retirement paths", () => {
    expect(canTransitionEditorialState("in_review", "approved")).toBe(true);
    expect(canTransitionEditorialState("approved", "published")).toBe(true);
    expect(canTransitionEditorialState("published", "superseded")).toBe(true);
  });

  it("rejects silent rewrites and unsupported jumps", () => {
    expect(canTransitionEditorialState("published", "draft")).toBe(false);
    expect(canTransitionEditorialState("draft", "published")).toBe(false);
    expect(canTransitionEditorialState("archived", "published")).toBe(false);
  });
});

describe("prerequisite graph", () => {
  it("accepts an acyclic learning path", () => {
    expect(() =>
      assertAcyclicPrerequisites([
        { levelId: "level-2", prerequisiteLevelId: "level-1" },
        { levelId: "level-3", prerequisiteLevelId: "level-2" },
      ]),
    ).not.toThrow();
  });

  it("rejects direct and indirect cycles", () => {
    expect(() =>
      assertAcyclicPrerequisites([{ levelId: "level-1", prerequisiteLevelId: "level-1" }]),
    ).toThrow("cannot require itself");

    expect(() =>
      assertAcyclicPrerequisites([
        { levelId: "level-1", prerequisiteLevelId: "level-2" },
        { levelId: "level-2", prerequisiteLevelId: "level-3" },
        { levelId: "level-3", prerequisiteLevelId: "level-1" },
      ]),
    ).toThrow("contains a cycle");
  });
});
