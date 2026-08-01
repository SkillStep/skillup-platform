import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "./auth.js";
import type { CapabilityService } from "./capabilities.js";
import type { ApiConfig } from "./config.js";
import { requireAuthenticatedLearner } from "./request-auth.js";

const RecommendationSchema = z.object({
  generatedAt: z.iso.datetime(),
  policyVersion: z.literal("deterministic-v1"),
  mode: z.enum(["resume", "remediate", "continue", "explore", "complete"]),
  recommendation: z
    .object({
      levelId: z.string().uuid(),
      levelVersionId: z.string().uuid(),
      title: z.string(),
      skillSlug: z.string(),
      pathSlug: z.string(),
      reason: z.string(),
      evidence: z.array(z.string()),
      startAllowedToday: z.boolean(),
    })
    .nullable(),
  alternatives: z.array(
    z.object({
      levelId: z.string().uuid(),
      title: z.string(),
      skillSlug: z.string(),
      pathSlug: z.string(),
    }),
  ),
  capability: z.object({
    tier: z.enum(["free", "premium"]),
    missionsRemainingToday: z.number().int().min(0).nullable(),
    aiPersonalization: z.boolean(),
  }),
});

export type RecommendationView = z.infer<typeof RecommendationSchema>;

type ActiveSessionRow = Readonly<{
  session_id: string;
  level_id: string;
  level_version_id: string;
  title: string;
  skill_slug: string;
  path_slug: string;
  current_challenge_ordinal: number;
  awarded_points: number;
  max_points: number;
  updated_at: Date;
}>;

type CompletionRow = Readonly<{
  level_id: string;
  level_version_id: string;
  title: string;
  skill_slug: string;
  path_slug: string;
  path_id: string;
  awarded_points: number;
  max_points: number;
  completed_at: Date;
}>;

type CandidateRow = Readonly<{
  level_id: string;
  level_version_id: string;
  title: string;
  skill_slug: string;
  path_slug: string;
}>;

type RecommendationContext = Readonly<{
  generatedAt: string;
  capability: RecommendationView["capability"];
  candidates: readonly CandidateRow[];
  startAllowedToday: boolean;
}>;

function startAllowed(tier: "free" | "premium", remaining: number | null): boolean {
  return tier === "premium" || (remaining ?? 0) > 0;
}

function alternatives(
  rows: readonly CandidateRow[],
  excludedLevelId?: string,
): RecommendationView["alternatives"] {
  return rows
    .filter((row) => row.level_id !== excludedLevelId)
    .slice(0, 3)
    .map((row) => ({
      levelId: row.level_id,
      title: row.title,
      skillSlug: row.skill_slug,
      pathSlug: row.path_slug,
    }));
}

function buildResumeRecommendation(
  context: RecommendationContext,
  activeRow: ActiveSessionRow,
): RecommendationView {
  return RecommendationSchema.parse({
    generatedAt: context.generatedAt,
    policyVersion: "deterministic-v1",
    mode: "resume",
    recommendation: {
      levelId: activeRow.level_id,
      levelVersionId: activeRow.level_version_id,
      title: activeRow.title,
      skillSlug: activeRow.skill_slug,
      pathSlug: activeRow.path_slug,
      reason: "Resume the exact reviewed level version already in progress.",
      evidence: [
        `Saved at challenge ${activeRow.current_challenge_ordinal + 1}.`,
        `${activeRow.awarded_points} of ${activeRow.max_points} available points are currently recorded.`,
        `Last activity: ${activeRow.updated_at.toISOString()}.`,
      ],
      startAllowedToday: true,
    },
    alternatives: alternatives(context.candidates, activeRow.level_id),
    capability: context.capability,
  });
}

function requiresRemediation(latestRow: CompletionRow | null): latestRow is CompletionRow {
  return (
    latestRow !== null &&
    latestRow.max_points > 0 &&
    latestRow.awarded_points / latestRow.max_points < 0.7
  );
}

function buildRemediationRecommendation(
  context: RecommendationContext,
  latestRow: CompletionRow,
): RecommendationView {
  return RecommendationSchema.parse({
    generatedAt: context.generatedAt,
    policyVersion: "deterministic-v1",
    mode: "remediate",
    recommendation: {
      levelId: latestRow.level_id,
      levelVersionId: latestRow.level_version_id,
      title: latestRow.title,
      skillSlug: latestRow.skill_slug,
      pathSlug: latestRow.path_slug,
      reason: "Repeat the recent level before advancing because the verified score is below 70%.",
      evidence: [
        `Verified score: ${latestRow.awarded_points} of ${latestRow.max_points}.`,
        `Completed: ${latestRow.completed_at.toISOString()}.`,
        "The learner can still choose another eligible level.",
      ],
      startAllowedToday: context.startAllowedToday,
    },
    alternatives: alternatives(context.candidates, latestRow.level_id),
    capability: context.capability,
  });
}

function buildCompleteRecommendation(context: RecommendationContext): RecommendationView {
  return RecommendationSchema.parse({
    generatedAt: context.generatedAt,
    policyVersion: "deterministic-v1",
    mode: "complete",
    recommendation: null,
    alternatives: [],
    capability: context.capability,
  });
}

function buildNextRecommendation(
  context: RecommendationContext,
  latestRow: CompletionRow | null,
  next: CandidateRow,
): RecommendationView {
  const samePath = latestRow?.path_slug === next.path_slug;
  return RecommendationSchema.parse({
    generatedAt: context.generatedAt,
    policyVersion: "deterministic-v1",
    mode: samePath ? "continue" : "explore",
    recommendation: {
      levelId: next.level_id,
      levelVersionId: next.level_version_id,
      title: next.title,
      skillSlug: next.skill_slug,
      pathSlug: next.path_slug,
      reason: samePath
        ? "Continue the same reviewed learning path with all prerequisites completed."
        : "Start the earliest eligible reviewed level in the launch catalog.",
      evidence: [
        "The level is published and its prerequisite levels are complete.",
        latestRow
          ? `The latest completed path was ${latestRow.path_slug}.`
          : "No prior completed level was found, so the catalog order is used.",
        context.startAllowedToday
          ? "The current capability state allows another mission today."
          : "The daily free mission allowance is exhausted; the recommendation remains visible for later.",
      ],
      startAllowedToday: context.startAllowedToday,
    },
    alternatives: alternatives(context.candidates, next.level_id),
    capability: context.capability,
  });
}

export type RecommendationService = Readonly<{
  get: (userId: string) => Promise<RecommendationView>;
}>;

export function createRecommendationService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    capabilityService: CapabilityService;
    now?: () => Date;
  }>,
): RecommendationService {
  const now = options.now ?? (() => new Date());

  return {
    get: async (userId) => {
      const [capability, active, latest] = await Promise.all([
        options.capabilityService.get(userId),
        options.pool.query<ActiveSessionRow>(
          `select ls.id as session_id,
                  lv.level_id,
                  lv.id as level_version_id,
                  lv.title,
                  s.slug as skill_slug,
                  lp.slug as path_slug,
                  ls.current_challenge_ordinal,
                  ls.awarded_points,
                  ls.max_points,
                  ls.updated_at
             from level_play_sessions ls
             join level_versions lv on lv.id = ls.level_version_id
             join levels l on l.id = lv.level_id
             join lessons le on le.id = l.lesson_id
             join learning_modules lm on lm.id = le.module_id
             join learning_paths lp on lp.id = lm.learning_path_id
             join skills s on s.id = lp.skill_id
            where ls.user_id = $1 and ls.status = 'active'
            order by ls.updated_at desc
            limit 1`,
          [userId],
        ),
        options.pool.query<CompletionRow>(
          `select lv.level_id,
                  lv.id as level_version_id,
                  lv.title,
                  s.slug as skill_slug,
                  lp.slug as path_slug,
                  lp.id as path_id,
                  ls.awarded_points,
                  ls.max_points,
                  ls.completed_at
             from level_play_sessions ls
             join level_versions lv on lv.id = ls.level_version_id
             join levels l on l.id = lv.level_id
             join lessons le on le.id = l.lesson_id
             join learning_modules lm on lm.id = le.module_id
             join learning_paths lp on lp.id = lm.learning_path_id
             join skills s on s.id = lp.skill_id
            where ls.user_id = $1 and ls.status = 'completed'
            order by ls.completed_at desc
            limit 1`,
          [userId],
        ),
      ]);

      const activeRow = active.rows[0] ?? null;
      const latestRow = latest.rows[0] ?? null;
      const candidateResult = await options.pool.query<CandidateRow>(
        `select l.id as level_id,
                lv.id as level_version_id,
                lv.title,
                s.slug as skill_slug,
                lp.slug as path_slug
           from levels l
           join level_versions lv on lv.level_id = l.id and lv.state = 'published'
           join lessons le on le.id = l.lesson_id
           join learning_modules lm on lm.id = le.module_id
           join learning_paths lp on lp.id = lm.learning_path_id
           join skills s on s.id = lp.skill_id
          where not exists (
                  select 1
                    from learner_enrollments completed
                   where completed.user_id = $1
                     and completed.level_id = l.id
                     and completed.state = 'completed'
                )
            and not exists (
                  select 1
                    from level_prerequisites prerequisite
                   where prerequisite.level_id = l.id
                     and not exists (
                           select 1
                             from learner_enrollments prerequisite_completion
                            where prerequisite_completion.user_id = $1
                              and prerequisite_completion.level_id = prerequisite.prerequisite_level_id
                              and prerequisite_completion.state = 'completed'
                         )
                )
          order by case when lp.id = $2::uuid then 0 else 1 end,
                   s.slug,
                   lp.slug,
                   lm.sort_order,
                   le.sort_order,
                   l.sort_order,
                   lv.version desc
          limit 4`,
        [userId, latestRow?.path_id ?? null],
      );
      const candidates = candidateResult.rows;
      const context: RecommendationContext = {
        generatedAt: now().toISOString(),
        capability: {
          tier: capability.tier,
          missionsRemainingToday: capability.missionsRemainingToday,
          aiPersonalization: capability.aiPersonalization,
        },
        candidates,
        startAllowedToday: startAllowed(capability.tier, capability.missionsRemainingToday),
      };

      if (activeRow) {
        return buildResumeRecommendation(context, activeRow);
      }
      if (requiresRemediation(latestRow)) {
        return buildRemediationRecommendation(context, latestRow);
      }

      const next = candidates[0] ?? null;
      if (!next) {
        return buildCompleteRecommendation(context);
      }
      return buildNextRecommendation(context, latestRow, next);
    },
  };
}

export function registerRecommendationRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    recommendationService: RecommendationService;
  }>,
): void {
  app.get("/v1/progress/recommendation", async (request) => {
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    return options.recommendationService.get(learner.id);
  });
}
