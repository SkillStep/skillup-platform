import { z } from "zod";

const RubricCriterionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().min(2).max(120),
  keywords: z.array(z.string().min(2).max(80)).min(1).max(30),
  weight: z.number().positive().max(1),
  minimumKeywordMatches: z.number().int().min(1).max(10).default(1),
});

const ManualReviewPolicySchema = z.object({
  policy: z.literal("manual_review_only"),
  uncertaintyMessage: z.string().min(20).max(300),
});

const DeterministicRubricPolicySchema = z
  .object({
    policy: z.literal("deterministic_rubric_v1"),
    criteria: z.array(RubricCriterionSchema).min(2).max(12),
    minimumWords: z.number().int().min(3).max(200),
    maximumWords: z.number().int().min(10).max(500),
    passScore: z.number().min(0.5).max(0.95),
    reviewBand: z.number().min(0.05).max(0.3),
    uncertaintyMessage: z.string().min(20).max(300),
  })
  .superRefine((policy, context) => {
    if (policy.minimumWords >= policy.maximumWords) {
      context.addIssue({
        code: "custom",
        path: ["maximumWords"],
        message: "maximumWords must be greater than minimumWords.",
      });
    }
    if (policy.passScore - policy.reviewBand < 0 || policy.passScore + policy.reviewBand > 1) {
      context.addIssue({
        code: "custom",
        path: ["reviewBand"],
        message: "The rubric review band must fit inside the zero-to-one score range.",
      });
    }
    const keys = policy.criteria.map((criterion) => criterion.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["criteria"],
        message: "Rubric criterion keys must be unique.",
      });
    }
  });

export const ShortResponseEvaluationSchema = z.discriminatedUnion("policy", [
  ManualReviewPolicySchema,
  DeterministicRubricPolicySchema,
]);

export type ShortResponseEvaluationPolicy = z.infer<typeof ShortResponseEvaluationSchema>;

export type ShortResponseRubricResult = Readonly<{
  status: "correct" | "incorrect" | "needs_review";
  confidence: number;
  matchedCriteria: readonly string[];
  explanation: string;
  reviewReason: string | null;
}>;

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string): number {
  const normalized = normalizedText(value);
  return normalized ? normalized.split(" ").length : 0;
}

function containsKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = normalizedText(keyword);
  if (!normalizedKeyword) return false;
  return ` ${text} `.includes(` ${normalizedKeyword} `) || text.includes(normalizedKeyword);
}

function confidenceFromDistance(distance: number, reviewBand: number): number {
  const normalized = Math.min(1, distance / Math.max(reviewBand, 0.01));
  return Number((0.6 + normalized * 0.35).toFixed(2));
}

export function evaluateShortResponseRubric(
  policyInput: unknown,
  response: string,
): ShortResponseRubricResult {
  const policy = ShortResponseEvaluationSchema.parse(policyInput);
  if (policy.policy === "manual_review_only") {
    return {
      status: "needs_review",
      confidence: 0,
      matchedCriteria: [],
      explanation: policy.uncertaintyMessage,
      reviewReason: "manual_review_policy",
    };
  }

  const normalized = normalizedText(response);
  const words = wordCount(response);
  if (words < policy.minimumWords) {
    return {
      status: "incorrect",
      confidence: 0.95,
      matchedCriteria: [],
      explanation: `The response is too short for the approved rubric. Include at least ${policy.minimumWords} words and explain the requirement, evidence and first action.`,
      reviewReason: null,
    };
  }
  if (words > policy.maximumWords) {
    return {
      status: "needs_review",
      confidence: 0.35,
      matchedCriteria: [],
      explanation: policy.uncertaintyMessage,
      reviewReason: "response_exceeds_rubric_length",
    };
  }

  let matchedWeight = 0;
  let totalWeight = 0;
  const matchedCriteria: string[] = [];
  for (const criterion of policy.criteria) {
    totalWeight += criterion.weight;
    const matches = criterion.keywords.filter((keyword) => containsKeyword(normalized, keyword));
    if (matches.length >= criterion.minimumKeywordMatches) {
      matchedWeight += criterion.weight;
      matchedCriteria.push(criterion.label);
    }
  }
  const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  const lowerBound = policy.passScore - policy.reviewBand;
  const upperBound = policy.passScore + policy.reviewBand;

  if (score >= upperBound) {
    return {
      status: "correct",
      confidence: confidenceFromDistance(score - policy.passScore, policy.reviewBand),
      matchedCriteria,
      explanation: `The response clearly meets the deterministic rubric (${Math.round(score * 100)}%). Evidence found: ${matchedCriteria.join(", ")}.`,
      reviewReason: null,
    };
  }
  if (score <= lowerBound) {
    return {
      status: "incorrect",
      confidence: confidenceFromDistance(policy.passScore - score, policy.reviewBand),
      matchedCriteria,
      explanation: `The response does not yet meet the deterministic rubric (${Math.round(score * 100)}%). Add a clear requirement, relevant evidence, a proportionate action and an explicit boundary or next step.`,
      reviewReason: null,
    };
  }

  return {
    status: "needs_review",
    confidence: Number((0.5 - Math.abs(score - policy.passScore)).toFixed(2)),
    matchedCriteria,
    explanation: policy.uncertaintyMessage,
    reviewReason: "score_within_uncertainty_band",
  };
}
