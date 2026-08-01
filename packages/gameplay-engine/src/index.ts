import { createHash } from "node:crypto";

import { PublicChallengeSchema, type PublicChallenge } from "@skillup/content-schema";
import { z } from "zod";

import {
  ShortResponseEvaluationSchema,
  evaluateShortResponseRubric,
} from "./short-response-rubric.js";

const OptionKeySchema = z.string().regex(/^[a-z0-9_]{1,40}$/);
const IdempotencyKeySchema = z.string().uuid();

const MultipleChoiceResponseSchema = z.object({
  type: z.literal("multiple_choice"),
  selectedOptionKeys: z.array(OptionKeySchema).min(1).max(8),
});

const TrueFalseResponseSchema = z.object({
  type: z.literal("true_false"),
  selectedOptionKey: OptionKeySchema,
});

const OrderingResponseSchema = z.object({
  type: z.literal("ordering"),
  orderedOptionKeys: z.array(OptionKeySchema).min(2).max(10),
});

const MatchingResponseSchema = z.object({
  type: z.literal("matching"),
  matches: z
    .array(
      z.object({
        leftKey: OptionKeySchema,
        rightKey: OptionKeySchema,
      }),
    )
    .min(2)
    .max(10),
});

const ScenarioResponseSchema = z.object({
  type: z.literal("scenario"),
  selectedOptionKeys: z.array(OptionKeySchema).min(1).max(8),
});

const FillBlankResponseSchema = z.object({
  type: z.literal("fill_blank"),
  value: z.string().max(500),
});

const ShortResponseSchema = z.object({
  type: z.literal("short_response"),
  value: z.string().min(1).max(2000),
});

export const ChallengeResponseSchema = z.discriminatedUnion("type", [
  MultipleChoiceResponseSchema,
  TrueFalseResponseSchema,
  OrderingResponseSchema,
  MatchingResponseSchema,
  ScenarioResponseSchema,
  FillBlankResponseSchema,
  ShortResponseSchema,
]);

export type ChallengeResponse = z.infer<typeof ChallengeResponseSchema>;

export const ChallengeSubmissionSchema = z.object({
  sessionId: z.string().uuid(),
  challengeId: z.string().uuid(),
  challengeVersionId: z.string().uuid(),
  idempotencyKey: IdempotencyKeySchema,
  response: ChallengeResponseSchema,
});

export type ChallengeSubmission = z.infer<typeof ChallengeSubmissionSchema>;

export const GameplaySessionSnapshotSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  levelId: z.string().uuid(),
  levelVersionId: z.string().uuid(),
  state: z.enum(["active", "completed", "abandoned", "expired"]),
  currentChallengeId: z.string().uuid(),
  currentChallengeVersionId: z.string().uuid(),
  attemptsUsed: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).max(20),
  expiresAt: z.iso.datetime(),
});

export type GameplaySessionSnapshot = z.infer<typeof GameplaySessionSnapshotSchema>;

export const ChallengeEvaluationResultSchema = z.object({
  challengeId: z.string().uuid(),
  challengeVersionId: z.string().uuid(),
  status: z.enum(["correct", "incorrect", "needs_review"]),
  awardedPoints: z.number().int().min(0),
  maxPoints: z.number().int().min(0),
  explanation: z.string().min(1).max(1000),
  retryAllowed: z.boolean(),
  attemptNumber: z.number().int().min(1),
  evaluatedAt: z.iso.datetime(),
  confidence: z.number().min(0).max(1).optional(),
  matchedCriteria: z.array(z.string().min(1).max(120)).max(12).optional(),
  reviewReason: z.string().min(1).max(120).nullable().optional(),
});

export type ChallengeEvaluationResult = z.infer<typeof ChallengeEvaluationResultSchema>;

export const StoredSubmissionAttemptSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  result: ChallengeEvaluationResultSchema,
});

export type StoredSubmissionAttempt = z.infer<typeof StoredSubmissionAttemptSchema>;

const MultipleChoiceEvaluationSchema = z.object({
  correctOptionKeys: z.array(OptionKeySchema).min(1).max(8),
});

const TrueFalseEvaluationSchema = z.object({
  correctOptionKey: OptionKeySchema,
});

const OrderingEvaluationSchema = z.object({
  correctOrder: z.array(OptionKeySchema).min(2).max(10),
});

const MatchingEvaluationSchema = z.object({
  correctPairs: z
    .array(
      z.object({
        leftKey: OptionKeySchema,
        rightKey: OptionKeySchema,
      }),
    )
    .min(2)
    .max(10),
});

const ScenarioEvaluationSchema = z.object({
  correctOptionKeys: z.array(OptionKeySchema).min(1).max(8),
});

const FillBlankEvaluationSchema = z.object({
  acceptedAnswers: z.array(z.string().min(1).max(500)).min(1).max(20),
  caseSensitive: z.boolean().default(false),
  trim: z.boolean().default(true),
  collapseWhitespace: z.boolean().default(true),
});

export class GameplayRuleError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "GameplayRuleError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function equalSets(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((value) => expected.has(value));
}

function equalSequences(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function optionKeys(challenge: PublicChallenge): readonly string[] {
  switch (challenge.type) {
    case "multiple_choice":
    case "true_false":
    case "ordering":
    case "scenario":
      return challenge.options.map((option) => option.key);
    case "matching":
      return [
        ...challenge.left.map((option) => option.key),
        ...challenge.right.map((option) => option.key),
      ];
    case "fill_blank":
    case "short_response":
      return [];
  }
}

function assertKnownKeys(candidate: readonly string[], allowed: readonly string[]): void {
  const allowedKeys = new Set(allowed);
  if (!unique(candidate) || candidate.some((key) => !allowedKeys.has(key))) {
    throw new GameplayRuleError(
      400,
      "invalid_response",
      "The response contains an unknown or repeated answer option.",
    );
  }
}

function normalizeText(value: string, policy: z.infer<typeof FillBlankEvaluationSchema>): string {
  let normalized = value;
  if (policy.trim) normalized = normalized.trim();
  if (policy.collapseWhitespace) normalized = normalized.replace(/\s+/g, " ");
  if (!policy.caseSensitive) normalized = normalized.toLocaleLowerCase("en-US");
  return normalized;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, stableValue(record[key])]),
    );
  }
  return value;
}

export function submissionRequestHash(submission: ChallengeSubmission): string {
  const parsed = ChallengeSubmissionSchema.parse(submission);
  return createHash("sha256")
    .update(JSON.stringify(stableValue(parsed)))
    .digest("hex");
}

export type SubmissionGuardResult =
  | Readonly<{ kind: "new"; requestHash: string }>
  | Readonly<{ kind: "duplicate"; result: ChallengeEvaluationResult }>;

export function guardSubmission(
  input: Readonly<{
    authenticatedUserId: string;
    session: GameplaySessionSnapshot;
    submission: ChallengeSubmission;
    evaluatedAt: Date;
    existingAttempt: StoredSubmissionAttempt | null;
  }>,
): SubmissionGuardResult {
  const session = GameplaySessionSnapshotSchema.parse(input.session);
  const submission = ChallengeSubmissionSchema.parse(input.submission);
  const requestHash = submissionRequestHash(submission);

  if (session.userId !== input.authenticatedUserId) {
    throw new GameplayRuleError(
      403,
      "session_owner_mismatch",
      "This gameplay session belongs to another learner.",
    );
  }
  if (session.id !== submission.sessionId) {
    throw new GameplayRuleError(
      409,
      "session_mismatch",
      "The submission does not match the active gameplay session.",
    );
  }

  if (input.existingAttempt) {
    const existing = StoredSubmissionAttemptSchema.parse(input.existingAttempt);
    if (existing.idempotencyKey !== submission.idempotencyKey) {
      throw new GameplayRuleError(
        409,
        "idempotency_mismatch",
        "The stored attempt does not match this request.",
      );
    }
    if (existing.requestHash !== requestHash) {
      throw new GameplayRuleError(
        409,
        "idempotency_reuse",
        "The idempotency key was already used for a different submission.",
      );
    }
    return { kind: "duplicate", result: existing.result };
  }

  if (session.state !== "active") {
    throw new GameplayRuleError(
      409,
      "session_not_active",
      "The gameplay session is no longer active.",
    );
  }
  if (new Date(session.expiresAt).getTime() <= input.evaluatedAt.getTime()) {
    throw new GameplayRuleError(410, "session_expired", "The gameplay session has expired.");
  }
  if (
    session.currentChallengeId !== submission.challengeId ||
    session.currentChallengeVersionId !== submission.challengeVersionId
  ) {
    throw new GameplayRuleError(
      409,
      "challenge_mismatch",
      "The submitted challenge does not match the server-authoritative session state.",
    );
  }
  if (session.attemptsUsed >= session.maxAttempts) {
    throw new GameplayRuleError(
      409,
      "attempt_limit_reached",
      "No attempts remain for this challenge.",
    );
  }

  return { kind: "new", requestHash };
}

export function evaluateChallenge(
  input: Readonly<{
    challenge: PublicChallenge;
    privateEvaluation: Record<string, unknown>;
    response: ChallengeResponse;
    explanation: string;
    attemptNumber: number;
    maxAttempts: number;
    evaluatedAt: Date;
  }>,
): ChallengeEvaluationResult {
  const challenge = PublicChallengeSchema.parse(input.challenge);
  const response = ChallengeResponseSchema.parse(input.response);
  const attemptNumber = z.number().int().min(1).parse(input.attemptNumber);
  const maxAttempts = z.number().int().min(1).max(20).parse(input.maxAttempts);
  const evaluatedAt = input.evaluatedAt.toISOString();

  if (response.type !== challenge.type) {
    throw new GameplayRuleError(
      400,
      "response_type_mismatch",
      "The response type does not match the challenge.",
    );
  }

  let status: "correct" | "incorrect" | "needs_review";

  switch (challenge.type) {
    case "multiple_choice": {
      const evaluation = MultipleChoiceEvaluationSchema.parse(input.privateEvaluation);
      const typedResponse = MultipleChoiceResponseSchema.parse(response);
      assertKnownKeys(typedResponse.selectedOptionKeys, optionKeys(challenge));
      if (typedResponse.selectedOptionKeys.length > challenge.selectionLimit) {
        throw new GameplayRuleError(
          400,
          "selection_limit_exceeded",
          "Too many answer options were selected.",
        );
      }
      status = equalSets(typedResponse.selectedOptionKeys, evaluation.correctOptionKeys)
        ? "correct"
        : "incorrect";
      break;
    }
    case "true_false": {
      const evaluation = TrueFalseEvaluationSchema.parse(input.privateEvaluation);
      const typedResponse = TrueFalseResponseSchema.parse(response);
      assertKnownKeys([typedResponse.selectedOptionKey], optionKeys(challenge));
      status =
        typedResponse.selectedOptionKey === evaluation.correctOptionKey ? "correct" : "incorrect";
      break;
    }
    case "ordering": {
      const evaluation = OrderingEvaluationSchema.parse(input.privateEvaluation);
      const typedResponse = OrderingResponseSchema.parse(response);
      assertKnownKeys(typedResponse.orderedOptionKeys, optionKeys(challenge));
      if (typedResponse.orderedOptionKeys.length !== challenge.options.length) {
        throw new GameplayRuleError(
          400,
          "incomplete_order",
          "Every answer option must appear once in the order.",
        );
      }
      status = equalSequences(typedResponse.orderedOptionKeys, evaluation.correctOrder)
        ? "correct"
        : "incorrect";
      break;
    }
    case "matching": {
      const evaluation = MatchingEvaluationSchema.parse(input.privateEvaluation);
      const typedResponse = MatchingResponseSchema.parse(response);
      const leftKeys = challenge.left.map((option) => option.key);
      const rightKeys = challenge.right.map((option) => option.key);
      assertKnownKeys(
        typedResponse.matches.map((match) => match.leftKey),
        leftKeys,
      );
      assertKnownKeys(
        typedResponse.matches.map((match) => match.rightKey),
        rightKeys,
      );
      if (typedResponse.matches.length !== challenge.left.length) {
        throw new GameplayRuleError(
          400,
          "incomplete_matching",
          "Every item must be matched exactly once.",
        );
      }
      const actualPairs = typedResponse.matches.map(
        (match) => `${match.leftKey}:${match.rightKey}`,
      );
      const expectedPairs = evaluation.correctPairs.map(
        (match) => `${match.leftKey}:${match.rightKey}`,
      );
      status = equalSets(actualPairs, expectedPairs) ? "correct" : "incorrect";
      break;
    }
    case "scenario": {
      const evaluation = ScenarioEvaluationSchema.parse(input.privateEvaluation);
      const typedResponse = ScenarioResponseSchema.parse(response);
      assertKnownKeys(typedResponse.selectedOptionKeys, optionKeys(challenge));
      status = equalSets(typedResponse.selectedOptionKeys, evaluation.correctOptionKeys)
        ? "correct"
        : "incorrect";
      break;
    }
    case "fill_blank": {
      const evaluation = FillBlankEvaluationSchema.parse(input.privateEvaluation);
      const typedResponse = FillBlankResponseSchema.parse(response);
      const submitted = normalizeText(typedResponse.value, evaluation);
      const accepted = evaluation.acceptedAnswers.map((answer) =>
        normalizeText(answer, evaluation),
      );
      status = accepted.includes(submitted) ? "correct" : "incorrect";
      break;
    }
    case "short_response": {
      const evaluation = ShortResponseEvaluationSchema.parse(input.privateEvaluation);
      const typedResponse = ShortResponseSchema.parse(response);
      const rubric = evaluateShortResponseRubric(evaluation, typedResponse.value);
      return ChallengeEvaluationResultSchema.parse({
        challengeId: challenge.id,
        challengeVersionId: challenge.versionId,
        status: rubric.status,
        awardedPoints: rubric.status === "correct" ? challenge.points : 0,
        maxPoints: challenge.points,
        explanation: rubric.explanation,
        retryAllowed: rubric.status === "incorrect" && attemptNumber < maxAttempts,
        attemptNumber,
        evaluatedAt,
        confidence: rubric.confidence,
        matchedCriteria: rubric.matchedCriteria,
        reviewReason: rubric.reviewReason,
      });
    }
  }

  const retryAllowed = status === "incorrect" && attemptNumber < maxAttempts;
  return ChallengeEvaluationResultSchema.parse({
    challengeId: challenge.id,
    challengeVersionId: challenge.versionId,
    status,
    awardedPoints: status === "correct" ? challenge.points : 0,
    maxPoints: challenge.points,
    explanation: input.explanation,
    retryAllowed,
    attemptNumber,
    evaluatedAt,
  });
}
