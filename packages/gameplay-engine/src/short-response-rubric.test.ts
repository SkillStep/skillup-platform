import { describe, expect, it } from "vitest";

import { evaluateChallenge } from "./index.js";
import { evaluateShortResponseRubric } from "./short-response-rubric.js";

const policy = {
  policy: "deterministic_rubric_v1" as const,
  minimumWords: 8,
  maximumWords: 120,
  passScore: 0.65,
  reviewBand: 0.15,
  uncertaintyMessage:
    "The response falls inside the rubric uncertainty band and is saved for review without an automatic score.",
  criteria: [
    {
      key: "requirement",
      label: "clear requirement",
      keywords: ["requirement", "goal", "confirm", "clarify"],
      weight: 0.25,
      minimumKeywordMatches: 1,
    },
    {
      key: "evidence",
      label: "relevant evidence",
      keywords: ["evidence", "source", "check", "verify"],
      weight: 0.25,
      minimumKeywordMatches: 1,
    },
    {
      key: "action",
      label: "first action",
      keywords: ["action", "step", "ask", "document"],
      weight: 0.25,
      minimumKeywordMatches: 1,
    },
    {
      key: "boundary",
      label: "safe boundary",
      keywords: ["risk", "privacy", "boundary", "next"],
      weight: 0.25,
      minimumKeywordMatches: 1,
    },
  ],
};

const challenge = {
  id: "11111111-1111-4111-8111-111111111111",
  versionId: "22222222-2222-4222-8222-222222222222",
  contentVersion: 1,
  locale: "en" as const,
  slug: "explain-reliable-approach",
  type: "short_response" as const,
  prompt: "Explain how you would handle the task.",
  instruction: "Include evidence and the first action.",
  points: 10,
  placeholder: "Write a concise answer",
  maxLength: 800,
  evaluationNotice:
    "Clearly strong or weak responses use a deterministic rubric. Borderline responses remain review-only.",
};

function evaluate(value: string, attemptNumber = 1) {
  return evaluateChallenge({
    challenge,
    privateEvaluation: policy,
    response: { type: "short_response", value },
    explanation: "The rubric explanation is authoritative for short responses.",
    attemptNumber,
    maxAttempts: 2,
    evaluatedAt: new Date("2026-08-01T00:00:00.000Z"),
  });
}

describe("deterministic short-response rubric", () => {
  it("awards points only when every high-confidence criterion is evident", () => {
    const result = evaluate(
      "I would confirm the requirement, verify the evidence from the source, document the first action, and check the privacy risk before the next step.",
    );

    expect(result.status).toBe("correct");
    expect(result.awardedPoints).toBe(10);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.matchedCriteria).toHaveLength(4);
    expect(result.reviewReason).toBeNull();
  });

  it("rejects clearly weak or too-short responses and permits a bounded retry", () => {
    const result = evaluate("I would just do it quickly.");

    expect(result.status).toBe("incorrect");
    expect(result.awardedPoints).toBe(0);
    expect(result.retryAllowed).toBe(true);
    expect(result.confidence).toBe(0.95);
  });

  it("holds borderline evidence for review instead of fabricating certainty", () => {
    const result = evaluate(
      "I would confirm the requirement, check the evidence, and then decide what to do carefully.",
    );

    expect(result.status).toBe("needs_review");
    expect(result.awardedPoints).toBe(0);
    expect(result.retryAllowed).toBe(false);
    expect(result.reviewReason).toBe("score_within_uncertainty_band");
    expect(result.matchedCriteria).toEqual(["clear requirement", "relevant evidence"]);
  });

  it("preserves the manual-review-only policy as a safe fallback", () => {
    const result = evaluateShortResponseRubric(
      {
        policy: "manual_review_only",
        uncertaintyMessage:
          "This response is saved for review and does not receive an automatic score until an approved reviewer evaluates it.",
      },
      "A complete response that should still remain unscored under the manual policy.",
    );

    expect(result.status).toBe("needs_review");
    expect(result.confidence).toBe(0);
    expect(result.reviewReason).toBe("manual_review_policy");
  });
});
