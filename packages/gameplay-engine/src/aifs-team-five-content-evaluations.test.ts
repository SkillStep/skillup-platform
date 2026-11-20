import { readFileSync } from "node:fs";

import type { PublicChallenge } from "@skillup/content-schema";
import { expect, it } from "vitest";

import { type ChallengeResponse, evaluateChallenge } from "./index.js";

type ChoiceQuestion = Readonly<{
  type: "multiple_choice" | "scenario";
  prompt: string;
  feedback: string;
  options: Readonly<Record<string, string>>;
  answer: string;
}>;
type BooleanQuestion = Readonly<{
  type: "true_false";
  prompt: string;
  feedback: string;
  answer: boolean;
}>;
type DraftQuestion = ChoiceQuestion | BooleanQuestion;

const slugs = [
  "prompt-engineering-generative-ai",
  "cybersecurity-digital-safety",
  "data-analytics-dashboards",
  "applied-ai-workflows",
  "sales-client-negotiation",
] as const;
const root = new URL("../../../docs/product/course-expansion/drafts/team-five/", import.meta.url);

function readCourse(slug: string): {
  modules: { levels: { challenges: DraftQuestion[] }[] }[];
} {
  return JSON.parse(readFileSync(new URL(`${slug}.json`, root), "utf8"));
}

function readAssessment(slug: string): { questions: ChoiceQuestion[] } {
  return JSON.parse(readFileSync(new URL(`assessments/${slug}.json`, root), "utf8"));
}

function asPublicChallenge(question: DraftQuestion): PublicChallenge {
  const common = {
    id: "00000000-0000-4000-8000-000000000001",
    versionId: "00000000-0000-4000-8000-000000000002",
    contentVersion: 1,
    locale: "en" as const,
    slug: "draft-evaluator-fixture",
    prompt: question.prompt,
    instruction: "Select the correct response.",
    points: 10,
  };
  if (question.type === "true_false") {
    return {
      ...common,
      type: "true_false",
      options: [
        { key: "true", label: "True" },
        { key: "false", label: "False" },
      ],
    };
  }
  const options = Object.entries(question.options).map(([key, label]) => ({ key, label }));
  if (question.type === "scenario") return { ...common, type: "scenario", options };
  return { ...common, type: "multiple_choice", options, selectionLimit: 1 };
}

function evaluateBoth(question: DraftQuestion): void {
  const challenge = asPublicChallenge(question);
  const correctKey =
    question.type === "true_false" ? (question.answer ? "true" : "false") : question.answer;
  const wrongKey =
    question.type === "true_false"
      ? question.answer
        ? "false"
        : "true"
      : (Object.keys(question.options).find((key) => key !== correctKey) ?? "a");
  const privateEvaluation =
    question.type === "true_false"
      ? { correctOptionKey: correctKey }
      : { correctOptionKeys: [correctKey] };
  const response = (key: string): ChallengeResponse =>
    question.type === "true_false"
      ? { type: "true_false", selectedOptionKey: key }
      : question.type === "scenario"
        ? { type: "scenario", selectedOptionKeys: [key] }
        : { type: "multiple_choice", selectedOptionKeys: [key] };
  const input = {
    challenge,
    privateEvaluation,
    explanation: question.feedback,
    attemptNumber: 1,
    maxAttempts: 2,
    evaluatedAt: new Date("2026-11-16T00:00:00.000Z"),
  };
  const good = evaluateChallenge({ ...input, response: response(correctKey) });
  const bad = evaluateChallenge({ ...input, response: response(wrongKey) });
  expect(good.status).toBe("correct");
  expect(good.awardedPoints).toBe(10);
  expect(bad.status).toBe("incorrect");
  expect(bad.awardedPoints).toBe(0);
  expect(bad.retryAllowed).toBe(true);
}

it("real gameplay evaluator accepts correct and rejects wrong answers for all 360 proposed practice questions", () => {
  let count = 0;
  for (const slug of slugs) {
    const course = readCourse(slug);
    for (const module of course.modules) {
      for (const level of module.levels) {
        for (const challenge of level.challenges) {
          evaluateBoth(challenge);
          count++;
        }
      }
    }
  }
  expect(count).toBe(360);
});

it("real gameplay evaluator checks every independent baseline/endline draft question", () => {
  let count = 0;
  for (const slug of slugs) {
    for (const question of readAssessment(slug).questions) {
      evaluateBoth(question);
      count++;
    }
  }
  expect(count).toBe(40);
});
