import { describe, expect, it } from "vitest";

import {
  GameplayRuleError,
  evaluateChallenge,
  guardSubmission,
  submissionRequestHash,
  type ChallengeSubmission,
  type GameplaySessionSnapshot,
} from "./index.js";

const sessionId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const levelId = "33333333-3333-4333-8333-333333333333";
const levelVersionId = "44444444-4444-4444-8444-444444444444";
const challengeId = "55555555-5555-4555-8555-555555555555";
const challengeVersionId = "66666666-6666-4666-8666-666666666666";
const idempotencyKey = "77777777-7777-4777-8777-777777777777";
const evaluatedAt = new Date("2026-07-30T12:00:00.000Z");

const multipleChoiceChallenge = {
  id: challengeId,
  versionId: challengeVersionId,
  contentVersion: 1,
  locale: "en" as const,
  slug: "choose-strongest-evidence",
  type: "multiple_choice" as const,
  prompt: "Which response gives the strongest evidence that a work process improved?",
  instruction: "Choose one answer.",
  points: 10,
  selectionLimit: 1,
  options: [
    { key: "claim", label: "I work hard and always improve things." },
    { key: "evidence", label: "I created a template that reduced weekly preparation time." },
    { key: "confidence", label: "I am confident that I can improve any process." },
  ],
};

const orderingChallenge = {
  id: challengeId,
  versionId: challengeVersionId,
  contentVersion: 1,
  locale: "en" as const,
  slug: "order-evidence-answer",
  type: "ordering" as const,
  prompt: "Put the parts of this evidence-based answer in the clearest order.",
  instruction: "Move all three parts into a logical sequence.",
  points: 10,
  options: [
    { key: "action", label: "I created a shared checklist." },
    { key: "result", label: "The next reports were submitted on time." },
    { key: "situation", label: "Responsibilities were unclear." },
  ],
};

function activeSession(overrides: Partial<GameplaySessionSnapshot> = {}): GameplaySessionSnapshot {
  return {
    id: sessionId,
    userId,
    levelId,
    levelVersionId,
    state: "active",
    currentChallengeId: challengeId,
    currentChallengeVersionId: challengeVersionId,
    attemptsUsed: 0,
    maxAttempts: 2,
    expiresAt: "2026-07-31T12:00:00.000Z",
    ...overrides,
  };
}

function submission(response: ChallengeSubmission["response"]): ChallengeSubmission {
  return {
    sessionId,
    challengeId,
    challengeVersionId,
    idempotencyKey,
    response,
  };
}

describe("server-authoritative submission guard", () => {
  it("accepts a new submission and creates a stable request hash", () => {
    const request = submission({ type: "multiple_choice", selectedOptionKeys: ["evidence"] });
    const guarded = guardSubmission({
      authenticatedUserId: userId,
      session: activeSession(),
      submission: request,
      evaluatedAt,
      existingAttempt: null,
    });

    expect(guarded).toEqual({ kind: "new", requestHash: submissionRequestHash(request) });
    expect(guarded.kind === "new" ? guarded.requestHash : "").toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the stored result for an exact network retry", () => {
    const request = submission({ type: "multiple_choice", selectedOptionKeys: ["evidence"] });
    const storedResult = evaluateChallenge({
      challenge: multipleChoiceChallenge,
      privateEvaluation: { correctOptionKeys: ["evidence"] },
      response: request.response,
      explanation: "Specific actions and results provide stronger evidence than broad claims.",
      attemptNumber: 1,
      maxAttempts: 2,
      evaluatedAt,
    });

    expect(
      guardSubmission({
        authenticatedUserId: userId,
        session: activeSession({ state: "completed" }),
        submission: request,
        evaluatedAt: new Date("2026-08-01T12:00:00.000Z"),
        existingAttempt: {
          idempotencyKey,
          requestHash: submissionRequestHash(request),
          result: storedResult,
        },
      }),
    ).toEqual({ kind: "duplicate", result: storedResult });
  });

  it("rejects idempotency-key reuse with a different payload", () => {
    const original = submission({ type: "multiple_choice", selectedOptionKeys: ["evidence"] });
    const tampered = submission({ type: "multiple_choice", selectedOptionKeys: ["claim"] });

    expect(() =>
      guardSubmission({
        authenticatedUserId: userId,
        session: activeSession(),
        submission: tampered,
        evaluatedAt,
        existingAttempt: {
          idempotencyKey,
          requestHash: submissionRequestHash(original),
          result: evaluateChallenge({
            challenge: multipleChoiceChallenge,
            privateEvaluation: { correctOptionKeys: ["evidence"] },
            response: original.response,
            explanation: "A specific action and result is strongest.",
            attemptNumber: 1,
            maxAttempts: 2,
            evaluatedAt,
          }),
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "idempotency_reuse", statusCode: 409 }));
  });

  it("rejects tampered ownership, challenge versions, expiry and attempt limits", () => {
    const request = submission({ type: "multiple_choice", selectedOptionKeys: ["evidence"] });

    const cases = [
      {
        session: activeSession(),
        authenticatedUserId: "88888888-8888-4888-8888-888888888888",
        code: "session_owner_mismatch",
      },
      {
        session: activeSession({
          currentChallengeVersionId: "99999999-9999-4999-8999-999999999999",
        }),
        authenticatedUserId: userId,
        code: "challenge_mismatch",
      },
      {
        session: activeSession({ expiresAt: "2026-07-30T11:59:59.000Z" }),
        authenticatedUserId: userId,
        code: "session_expired",
      },
      {
        session: activeSession({ attemptsUsed: 2, maxAttempts: 2 }),
        authenticatedUserId: userId,
        code: "attempt_limit_reached",
      },
    ];

    for (const testCase of cases) {
      try {
        guardSubmission({
          authenticatedUserId: testCase.authenticatedUserId,
          session: testCase.session,
          submission: request,
          evaluatedAt,
          existingAttempt: null,
        });
        throw new Error("Expected the submission guard to reject the request.");
      } catch (error) {
        expect(error).toBeInstanceOf(GameplayRuleError);
        expect(error).toMatchObject({ code: testCase.code });
      }
    }
  });
});

describe("deterministic challenge evaluation", () => {
  it("scores a correct multiple-choice answer without exposing the answer key", () => {
    const result = evaluateChallenge({
      challenge: multipleChoiceChallenge,
      privateEvaluation: { correctOptionKeys: ["evidence"] },
      response: { type: "multiple_choice", selectedOptionKeys: ["evidence"] },
      explanation: "Specific actions and results are stronger than broad claims.",
      attemptNumber: 1,
      maxAttempts: 2,
      evaluatedAt,
    });

    expect(result).toMatchObject({
      status: "correct",
      awardedPoints: 10,
      maxPoints: 10,
      retryAllowed: false,
    });
    expect(JSON.stringify(result)).not.toContain("correctOptionKeys");
    expect(JSON.stringify(result)).not.toContain("evidence");
  });

  it("allows a bounded retry after an incorrect answer", () => {
    const first = evaluateChallenge({
      challenge: multipleChoiceChallenge,
      privateEvaluation: { correctOptionKeys: ["evidence"] },
      response: { type: "multiple_choice", selectedOptionKeys: ["claim"] },
      explanation: "Broad claims do not show what changed.",
      attemptNumber: 1,
      maxAttempts: 2,
      evaluatedAt,
    });
    const final = evaluateChallenge({
      challenge: multipleChoiceChallenge,
      privateEvaluation: { correctOptionKeys: ["evidence"] },
      response: { type: "multiple_choice", selectedOptionKeys: ["claim"] },
      explanation: "Broad claims do not show what changed.",
      attemptNumber: 2,
      maxAttempts: 2,
      evaluatedAt,
    });

    expect(first).toMatchObject({ status: "incorrect", awardedPoints: 0, retryAllowed: true });
    expect(final).toMatchObject({ status: "incorrect", awardedPoints: 0, retryAllowed: false });
  });

  it("evaluates ordering against the exact published sequence", () => {
    const result = evaluateChallenge({
      challenge: orderingChallenge,
      privateEvaluation: { correctOrder: ["situation", "action", "result"] },
      response: {
        type: "ordering",
        orderedOptionKeys: ["situation", "action", "result"],
      },
      explanation: "A clear example establishes the situation, action and result.",
      attemptNumber: 1,
      maxAttempts: 2,
      evaluatedAt,
    });

    expect(result.status).toBe("correct");
  });

  it("normalizes fill-in responses only according to the approved policy", () => {
    const result = evaluateChallenge({
      challenge: {
        id: challengeId,
        versionId: challengeVersionId,
        contentVersion: 1,
        locale: "en",
        slug: "name-answer-structure",
        type: "fill_blank",
        prompt: "Complete the phrase: situation, action and ____.",
        instruction: "Enter one word.",
        points: 5,
        placeholder: "Your answer",
        maxLength: 30,
      },
      privateEvaluation: {
        acceptedAnswers: ["result"],
        caseSensitive: false,
        trim: true,
        collapseWhitespace: true,
      },
      response: { type: "fill_blank", value: "  RESULT  " },
      explanation: "The final part states the result.",
      attemptNumber: 1,
      maxAttempts: 2,
      evaluatedAt,
    });

    expect(result).toMatchObject({ status: "correct", awardedPoints: 5 });
  });

  it("keeps short responses unscored until a human-reviewed policy exists", () => {
    const result = evaluateChallenge({
      challenge: {
        id: challengeId,
        versionId: challengeVersionId,
        contentVersion: 1,
        locale: "en",
        slug: "draft-your-answer",
        type: "short_response",
        prompt: "Write a concise example that shows one action and one measurable result.",
        instruction: "Use no more than three sentences.",
        points: 10,
        placeholder: "Write your answer",
        maxLength: 500,
        evaluationNotice: "This answer requires a transparent review before any score is awarded.",
      },
      privateEvaluation: {
        policy: "manual_review_only",
        uncertaintyMessage:
          "Your answer was saved for review. No automated score or reward has been awarded.",
      },
      response: {
        type: "short_response",
        value: "I created a checklist that reduced missed report fields by half.",
      },
      explanation: "This challenge requires review.",
      attemptNumber: 1,
      maxAttempts: 1,
      evaluatedAt,
    });

    expect(result).toMatchObject({
      status: "needs_review",
      awardedPoints: 0,
      retryAllowed: false,
    });
  });

  it("rejects unknown, repeated and incomplete option payloads", () => {
    expect(() =>
      evaluateChallenge({
        challenge: orderingChallenge,
        privateEvaluation: { correctOrder: ["situation", "action", "result"] },
        response: { type: "ordering", orderedOptionKeys: ["situation", "unknown"] },
        explanation: "A clear example follows the expected sequence.",
        attemptNumber: 1,
        maxAttempts: 2,
        evaluatedAt,
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_response" }));
  });
});
