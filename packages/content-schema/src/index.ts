import { PublicLocaleSchema } from "@skillup/contracts";
import { z } from "zod";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const VersionSchema = z.number().int().positive();

export const ContentStatusSchema = z.enum(["draft", "in_review", "published", "archived"]);
export const EditorialStateSchema = z.enum([
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "superseded",
  "archived",
  "rejected",
]);
export const IndexPolicySchema = z.enum(["index", "noindex"]);
export const ChallengeTypeSchema = z.enum([
  "multiple_choice",
  "true_false",
  "ordering",
  "matching",
  "scenario",
  "fill_blank",
  "short_response",
]);

export type EditorialState = z.infer<typeof EditorialStateSchema>;
export type ChallengeType = z.infer<typeof ChallengeTypeSchema>;

export const SkillSummarySchema = z.object({
  id: z.string().uuid(),
  slug: SlugSchema,
  locale: PublicLocaleSchema,
  title: z.string().min(3).max(100),
  summary: z.string().min(40).max(300),
  status: ContentStatusSchema,
  version: VersionSchema,
  reviewedAt: z.iso.datetime(),
});

export type SkillSummary = z.infer<typeof SkillSummarySchema>;

export const LearningObjectiveSchema = z.object({
  id: z.string().uuid(),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,39}$/),
  statement: z.string().min(10).max(240),
  assessable: z.boolean(),
});

export const LevelSummarySchema = z.object({
  id: z.string().uuid(),
  slug: SlugSchema,
  title: z.string().min(3).max(120),
  publicSummary: z.string().min(40).max(300),
  objectiveIds: z.array(z.string().uuid()).min(1),
  challengeTypes: z.array(ChallengeTypeSchema).min(1),
  estimatedMinutes: z.number().int().min(1).max(20),
  contentVersion: VersionSchema,
  locale: PublicLocaleSchema,
});

export type LevelSummary = z.infer<typeof LevelSummarySchema>;

const AnswerOptionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().min(1).max(500),
  accessibleLabel: z.string().min(1).max(500).nullable().optional(),
});

const BasePublicChallengeSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  contentVersion: VersionSchema,
  locale: PublicLocaleSchema,
  slug: SlugSchema,
  prompt: z.string().min(10).max(1000),
  instruction: z.string().min(3).max(300).nullable().optional(),
  points: z.number().int().min(0).max(1000),
});

export const PublicChallengeSchema = z.discriminatedUnion("type", [
  BasePublicChallengeSchema.extend({
    type: z.literal("multiple_choice"),
    options: z.array(AnswerOptionSchema).min(2).max(8),
    selectionLimit: z.number().int().min(1).max(8).default(1),
  }),
  BasePublicChallengeSchema.extend({
    type: z.literal("true_false"),
    options: z
      .array(AnswerOptionSchema)
      .length(2)
      .refine(
        (options) => new Set(options.map((option) => option.key)).size === 2,
        "True/false options must use distinct keys.",
      ),
  }),
  BasePublicChallengeSchema.extend({
    type: z.literal("ordering"),
    options: z.array(AnswerOptionSchema).min(2).max(10),
  }),
  BasePublicChallengeSchema.extend({
    type: z.literal("matching"),
    left: z.array(AnswerOptionSchema).min(2).max(10),
    right: z.array(AnswerOptionSchema).min(2).max(10),
  }),
  BasePublicChallengeSchema.extend({
    type: z.literal("scenario"),
    options: z.array(AnswerOptionSchema).min(2).max(8),
  }),
  BasePublicChallengeSchema.extend({
    type: z.literal("fill_blank"),
    placeholder: z.string().min(1).max(80),
    maxLength: z.number().int().min(1).max(500),
  }),
  BasePublicChallengeSchema.extend({
    type: z.literal("short_response"),
    placeholder: z.string().min(1).max(160),
    maxLength: z.number().int().min(20).max(2000),
    evaluationNotice: z.string().min(20).max(300),
  }),
]);

export type PublicChallenge = z.infer<typeof PublicChallengeSchema>;

export const PrivateChallengeEvaluationSchema = z.object({
  challengeVersionId: z.string().uuid(),
  evaluator: z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
  evaluation: z
    .record(z.string(), z.unknown())
    .refine((value) => Object.keys(value).length > 0, "Private evaluation cannot be empty."),
});

export const PublishedLevelPackageSchema = z.object({
  category: z.object({
    id: z.string().uuid(),
    versionId: z.string().uuid(),
    slug: SlugSchema,
    title: z.string().min(3).max(100),
  }),
  skill: z.object({
    id: z.string().uuid(),
    versionId: z.string().uuid(),
    slug: SlugSchema,
    title: z.string().min(3).max(100),
  }),
  path: z.object({
    id: z.string().uuid(),
    versionId: z.string().uuid(),
    slug: SlugSchema,
    title: z.string().min(3).max(120),
  }),
  module: z.object({
    id: z.string().uuid(),
    versionId: z.string().uuid(),
    slug: SlugSchema,
    title: z.string().min(3).max(120),
  }),
  lesson: z.object({
    id: z.string().uuid(),
    versionId: z.string().uuid(),
    slug: SlugSchema,
    title: z.string().min(3).max(120),
  }),
  level: LevelSummarySchema,
  objectives: z.array(LearningObjectiveSchema).min(1),
  challenges: z.array(PublicChallengeSchema).min(1),
  indexPolicy: IndexPolicySchema,
  canonicalPath: z.string().regex(/^\/(en|ur)\/[a-z0-9/-]+$/),
});

export type PublishedLevelPackage = z.infer<typeof PublishedLevelPackageSchema>;

const allowedEditorialTransitions: Readonly<Record<EditorialState, readonly EditorialState[]>> = {
  draft: ["in_review", "rejected", "archived"],
  in_review: ["draft", "approved", "rejected"],
  approved: ["draft", "scheduled", "published", "rejected"],
  scheduled: ["approved", "published", "archived"],
  published: ["superseded", "archived"],
  superseded: ["archived"],
  archived: [],
  rejected: ["draft", "archived"],
};

export function canTransitionEditorialState(from: EditorialState, to: EditorialState): boolean {
  return allowedEditorialTransitions[from].includes(to);
}

export function assertAcyclicPrerequisites(
  edges: readonly Readonly<{ levelId: string; prerequisiteLevelId: string }>[],
): void {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.levelId === edge.prerequisiteLevelId) {
      throw new Error("A level cannot require itself.");
    }
    const prerequisites = graph.get(edge.levelId) ?? [];
    prerequisites.push(edge.prerequisiteLevelId);
    graph.set(edge.levelId, prerequisites);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(levelId: string): void {
    if (visiting.has(levelId)) throw new Error("The prerequisite graph contains a cycle.");
    if (visited.has(levelId)) return;
    visiting.add(levelId);
    for (const prerequisite of graph.get(levelId) ?? []) visit(prerequisite);
    visiting.delete(levelId);
    visited.add(levelId);
  }

  for (const levelId of graph.keys()) visit(levelId);
}
