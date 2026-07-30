import { PublicLocaleSchema } from "@skillup/contracts";
import { z } from "zod";

export const ContentStatusSchema = z.enum(["draft", "in_review", "published", "archived"]);
export const ChallengeTypeSchema = z.enum([
  "multiple_choice",
  "true_false",
  "ordering",
  "matching",
  "scenario",
  "fill_blank",
  "short_response",
]);

export const SkillSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  locale: PublicLocaleSchema,
  title: z.string().min(3).max(100),
  summary: z.string().min(40).max(300),
  status: ContentStatusSchema,
  version: z.number().int().positive(),
  reviewedAt: z.iso.datetime(),
});

export type SkillSummary = z.infer<typeof SkillSummarySchema>;

export const LearningObjectiveSchema = z.object({
  id: z.string().uuid(),
  statement: z.string().min(10).max(240),
  assessable: z.boolean(),
});

export const LevelSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(3).max(120),
  objectiveIds: z.array(z.string().uuid()).min(1),
  challengeTypes: z.array(ChallengeTypeSchema).min(1),
  estimatedMinutes: z.number().int().min(1).max(20),
  contentVersion: z.number().int().positive(),
});

export type LevelSummary = z.infer<typeof LevelSummarySchema>;
