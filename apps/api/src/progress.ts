import { createHash } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

import type { AuthService, AuthenticatedLearner } from "./auth.js";
import type { ApiConfig } from "./config.js";
import {
  applyQualifiedActivity,
  isValidTimeZone,
  leaderboardPeriodStart,
  localDateFor,
  progressCapabilities,
  type LeaderboardPeriod,
  type ProgressTier,
} from "./progress-policy.js";

const LeaderboardPeriodSchema = z.enum(["week", "month", "all_time"]);
const ProgressTierSchema = z.enum(["free", "premium"]);
const LeaderboardStatusSchema = z.enum(["eligible", "suspended"]);
const LeaderboardAliasSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/);

const ProgressSettingsViewSchema = z.object({
  timezone: z.string().min(3).max(64),
  tier: ProgressTierSchema,
  leaderboardOptIn: z.boolean(),
  leaderboardAlias: LeaderboardAliasSchema.nullable(),
  leaderboardStatus: LeaderboardStatusSchema,
});

const ProgressSummaryViewSchema = z.object({
  generatedAt: z.iso.datetime(),
  capabilities: z.object({
    tier: ProgressTierSchema,
    detailedLevelHistory: z.boolean(),
    ledgerHistoryLimit: z.number().int().positive(),
    levelHistoryLimit: z.number().int().positive(),
    leaderboardAccess: z.boolean(),
  }),
  pointsBalance: z.number().int(),
  streak: z.object({
    currentDays: z.number().int().min(0),
    longestDays: z.number().int().min(0),
    lastQualifiedDate: z.string().nullable(),
    graceCredits: z.number().int().min(0),
    timezone: z.string(),
  }),
  badges: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      description: z.string(),
      unlockedAt: z.iso.datetime(),
      explanation: z.string(),
    }),
  ),
  levels: z.array(
    z.object({
      levelId: z.string().uuid(),
      levelVersionId: z.string().uuid(),
      title: z.string(),
      bestAwardedPoints: z.number().int().min(0),
      maxPoints: z.number().int().min(0),
      completionCount: z.number().int().min(0),
      lastCompletedAt: z.iso.datetime().nullable(),
    }),
  ),
  resume: z
    .object({
      sessionId: z.string().uuid(),
      levelId: z.string().uuid(),
      title: z.string(),
      currentChallengeOrdinal: z.number().int().min(0),
      awardedPoints: z.number().int().min(0),
      maxPoints: z.number().int().min(0),
      lastActivityAt: z.iso.datetime(),
    })
    .nullable(),
  leaderboard: ProgressSettingsViewSchema.pick({
    leaderboardOptIn: true,
    leaderboardAlias: true,
    leaderboardStatus: true,
  }),
});

const ProgressLedgerViewSchema = z.object({
  limit: z.number().int().positive(),
  entries: z.array(
    z.object({
      id: z.string().uuid(),
      pointsDelta: z.number().int(),
      reasonCode: z.string(),
      explanation: z.string(),
      sourceType: z.enum(["level_completion", "badge", "manual_adjustment", "correction"]),
      occurredAt: z.iso.datetime(),
      correctionOfId: z.string().uuid().nullable(),
    }),
  ),
});

const LeaderboardViewSchema = z.object({
  period: LeaderboardPeriodSchema,
  generatedAt: z.iso.datetime(),
  entries: z.array(
    z.object({
      rank: z.number().int().positive(),
      alias: LeaderboardAliasSchema,
      points: z.number().int(),
    }),
  ),
});

const UpdatePreferencesSchema = z
  .object({
    timezone: z.string().min(3).max(64).optional(),
    leaderboardOptIn: z.boolean().optional(),
    leaderboardAlias: LeaderboardAliasSchema.nullable().optional(),
  })
  .strict();

export type ProgressSettingsView = z.infer<typeof ProgressSettingsViewSchema>;
export type ProgressSummaryView = z.infer<typeof ProgressSummaryViewSchema>;
export type ProgressLedgerView = z.infer<typeof ProgressLedgerViewSchema>;
export type LeaderboardView = z.infer<typeof LeaderboardViewSchema>;

export type ProgressService = Readonly<{
  summary: (userId: string) => Promise<ProgressSummaryView>;
  ledger: (userId: string) => Promise<ProgressLedgerView>;
  leaderboard: (period: LeaderboardPeriod) => Promise<LeaderboardView>;
  updatePreferences: (
    userId: string,
    input: z.infer<typeof UpdatePreferencesSchema>,
  ) => Promise<ProgressSettingsView>;
}>;

export class ProgressServiceError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ProgressServiceError";
    this.statusCode = statusCode;
  }
}

type SettingsRow = Readonly<{
  user_id: string;
  timezone: string;
  tier: ProgressTier;
  leaderboard_opt_in: boolean;
  leaderboard_alias: string | null;
  leaderboard_status: "eligible" | "suspended";
}>;

type StreakRow = Readonly<{
  current_days: number;
  longest_days: number;
  last_qualified_date: string | null;
  grace_credits: number;
  timezone: string;
}>;

type BadgeDefinitionRow = Readonly<{
  id: string;
  key: string;
  title: string;
  description: string;
  rule_kind: "first_level" | "perfect_level" | "streak_days" | "points_total";
  threshold: number;
}>;

function stableAlias(userId: string): string {
  const suffix = createHash("sha256")
    .update(`skillup-leaderboard:${userId}`)
    .digest("hex")
    .slice(0, 10);
  return `Learner-${suffix}`;
}

async function transaction<T>(
  pool: DatabaseClient["pool"],
  operation: (database: PoolClient) => Promise<T>,
): Promise<T> {
  const database = await pool.connect();
  try {
    await database.query("begin");
    const result = await operation(database);
    await database.query("commit");
    return result;
  } catch (error) {
    await database.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    database.release();
  }
}

async function ensureSettings(
  database: PoolClient,
  userId: string,
  lock = false,
): Promise<SettingsRow> {
  await database.query(
    `insert into learner_progress_settings
      (user_id, timezone, tier, leaderboard_opt_in, leaderboard_alias, leaderboard_status)
     values ($1, 'UTC', 'free', false, $2, 'eligible')
     on conflict (user_id) do nothing`,
    [userId, stableAlias(userId)],
  );

  const result = await database.query<SettingsRow>(
    `select user_id, timezone, tier, leaderboard_opt_in, leaderboard_alias, leaderboard_status
       from learner_progress_settings
      where user_id = $1${lock ? " for update" : ""}`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new ProgressServiceError(500, "Progress settings could not be resolved.");
  return row;
}

function settingsView(settings: SettingsRow): ProgressSettingsView {
  return ProgressSettingsViewSchema.parse({
    timezone: settings.timezone,
    tier: settings.tier,
    leaderboardOptIn: settings.leaderboard_opt_in,
    leaderboardAlias: settings.leaderboard_alias,
    leaderboardStatus: settings.leaderboard_status,
  });
}

async function pointsBalance(database: PoolClient, userId: string): Promise<number> {
  const result = await database.query<{ balance: number }>(
    `select coalesce(sum(points_delta), 0)::int as balance
       from points_ledger
      where user_id = $1`,
    [userId],
  );
  return result.rows[0]?.balance ?? 0;
}

async function loadStreak(database: PoolClient, userId: string, lock = false): Promise<StreakRow> {
  await database.query(
    `insert into learner_streaks
      (user_id, timezone, current_days, longest_days, last_qualified_date, grace_credits)
     values ($1, 'UTC', 0, 0, null, 1)
     on conflict (user_id) do nothing`,
    [userId],
  );
  const result = await database.query<StreakRow>(
    `select current_days, longest_days, last_qualified_date::text, grace_credits, timezone
       from learner_streaks
      where user_id = $1${lock ? " for update" : ""}`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new ProgressServiceError(500, "The learner streak could not be resolved.");
  return row;
}

export async function recordLevelStarted(
  database: PoolClient,
  input: Readonly<{
    userId: string;
    levelId: string;
    sessionId: string;
    startedAt: Date;
  }>,
): Promise<void> {
  await ensureSettings(database, input.userId);
  await database.query(
    `insert into learner_enrollments
      (user_id, level_id, state, last_session_id, enrolled_at, updated_at)
     values ($1, $2, 'in_progress', $3, $4, $4)
     on conflict (user_id, level_id) do update
       set state = case
             when learner_enrollments.state = 'completed' then learner_enrollments.state
             else 'in_progress'
           end,
           last_session_id = excluded.last_session_id,
           updated_at = excluded.updated_at`,
    [input.userId, input.levelId, input.sessionId, input.startedAt],
  );
}

async function evaluateBadgeUnlocks(
  database: PoolClient,
  input: Readonly<{
    userId: string;
    sessionId: string;
    levelVersionId: string;
    awardedPoints: number;
    maxPoints: number;
    pointsBalance: number;
    currentStreak: number;
    completionCount: number;
    completedAt: Date;
  }>,
): Promise<void> {
  const definitions = await database.query<BadgeDefinitionRow>(
    `select id, key, title, description, rule_kind, threshold
       from badge_definitions
      where state = 'active'
      order by key`,
  );

  for (const definition of definitions.rows) {
    const qualified =
      (definition.rule_kind === "first_level" && input.completionCount >= definition.threshold) ||
      (definition.rule_kind === "perfect_level" &&
        input.maxPoints > 0 &&
        input.awardedPoints === input.maxPoints) ||
      (definition.rule_kind === "streak_days" && input.currentStreak >= definition.threshold) ||
      (definition.rule_kind === "points_total" && input.pointsBalance >= definition.threshold);
    if (!qualified) continue;

    const latest = await database.query<{ action: "unlocked" | "revoked" | "corrected" }>(
      `select action
         from learner_badge_events
        where user_id = $1 and badge_definition_id = $2
        order by occurred_at desc, created_at desc
        limit 1`,
      [input.userId, definition.id],
    );
    if (latest.rows[0]?.action === "unlocked") continue;

    const explanation = `Unlocked ${definition.title}: ${definition.description}`;
    await database.query(
      `insert into learner_badge_events
        (user_id, badge_definition_id, event_key, action, evidence, explanation, occurred_at)
       values ($1, $2, $3, 'unlocked', $4::jsonb, $5, $6)
       on conflict (event_key) do nothing`,
      [
        input.userId,
        definition.id,
        `level-completion:${input.sessionId}:badge:${definition.key}`,
        JSON.stringify({
          sessionId: input.sessionId,
          levelVersionId: input.levelVersionId,
          awardedPoints: input.awardedPoints,
          maxPoints: input.maxPoints,
          pointsBalance: input.pointsBalance,
          currentStreak: input.currentStreak,
          completionCount: input.completionCount,
        }),
        explanation,
        input.completedAt,
      ],
    );
  }
}

export async function recordLevelCompletion(
  database: PoolClient,
  input: Readonly<{
    userId: string;
    sessionId: string;
    levelId: string;
    levelVersionId: string;
    awardedPoints: number;
    maxPoints: number;
    previousBestAwardedPoints: number;
    completedAt: Date;
  }>,
): Promise<void> {
  const settings = await ensureSettings(database, input.userId, true);
  if (!isValidTimeZone(settings.timezone)) {
    throw new ProgressServiceError(500, "The stored learner timezone is invalid.");
  }

  await database.query(
    `insert into learner_enrollments
      (user_id, level_id, state, last_session_id, enrolled_at, completed_at, updated_at)
     values ($1, $2, 'completed', $3, $4, $4, $4)
     on conflict (user_id, level_id) do update
       set state = 'completed',
           last_session_id = excluded.last_session_id,
           completed_at = excluded.completed_at,
           updated_at = excluded.updated_at`,
    [input.userId, input.levelId, input.sessionId, input.completedAt],
  );

  const pointsDelta = Math.max(0, input.awardedPoints - input.previousBestAwardedPoints);
  if (pointsDelta > 0) {
    await database.query(
      `insert into points_ledger
        (user_id, event_key, source_type, source_id, points_delta, reason_code,
         explanation, correction_of_id, occurred_at)
       values ($1, $2, 'level_completion', $3, $4, 'verified_score_improvement', $5, null, $6)
       on conflict (event_key) do nothing`,
      [
        input.userId,
        `level-completion:${input.sessionId}`,
        input.sessionId,
        pointsDelta,
        `Awarded ${pointsDelta} verified point${pointsDelta === 1 ? "" : "s"} for improving the saved best score on this published level version.`,
        input.completedAt,
      ],
    );
  }

  const existingStreak = await loadStreak(database, input.userId, true);
  const localDate = localDateFor(input.completedAt, settings.timezone);
  const transition = applyQualifiedActivity(
    {
      currentDays: existingStreak.current_days,
      longestDays: existingStreak.longest_days,
      lastQualifiedDate: existingStreak.last_qualified_date,
      graceCredits: existingStreak.grace_credits,
    },
    localDate,
  );
  const streakEvent = await database.query<{ id: string }>(
    `insert into streak_events
      (user_id, event_key, event_type, source_id, local_date, timezone, explanation, occurred_at)
     values ($1, $2, $3, $4, $5::date, $6, $7, $8)
     on conflict (event_key) do nothing
     returning id`,
    [
      input.userId,
      `level-completion:${input.sessionId}:streak`,
      transition.eventType,
      input.sessionId,
      localDate,
      settings.timezone,
      transition.explanation,
      input.completedAt,
    ],
  );

  if (streakEvent.rows[0] && transition.changed) {
    await database.query(
      `update learner_streaks
          set timezone = $2,
              current_days = $3,
              longest_days = $4,
              last_qualified_date = $5::date,
              grace_credits = $6,
              updated_at = $7
        where user_id = $1`,
      [
        input.userId,
        settings.timezone,
        transition.currentDays,
        transition.longestDays,
        transition.lastQualifiedDate,
        transition.graceCredits,
        input.completedAt,
      ],
    );
  }

  const balance = await pointsBalance(database, input.userId);
  const completionCounts = await database.query<{ count: number }>(
    `select coalesce(sum(completion_count), 0)::int as count
       from learner_level_progress
      where user_id = $1`,
    [input.userId],
  );
  await evaluateBadgeUnlocks(database, {
    userId: input.userId,
    sessionId: input.sessionId,
    levelVersionId: input.levelVersionId,
    awardedPoints: input.awardedPoints,
    maxPoints: input.maxPoints,
    pointsBalance: balance,
    currentStreak: transition.changed ? transition.currentDays : existingStreak.current_days,
    completionCount: completionCounts.rows[0]?.count ?? 0,
    completedAt: input.completedAt,
  });
}

export function createProgressService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    now?: () => Date;
  }>,
): ProgressService {
  const now = options.now ?? (() => new Date());

  return {
    summary: async (userId) =>
      transaction(options.pool, async (database) => {
        const generatedAt = now();
        const settings = await ensureSettings(database, userId);
        const capabilities = progressCapabilities(settings.tier);
        const balance = await pointsBalance(database, userId);
        const streak = await loadStreak(database, userId);

        const badges = await database.query<{
          key: string;
          title: string;
          description: string;
          unlocked_at: Date;
          explanation: string;
        }>(
          `with latest as (
             select lbe.badge_definition_id, lbe.action, lbe.occurred_at, lbe.explanation,
                    row_number() over (
                      partition by lbe.badge_definition_id
                      order by lbe.occurred_at desc, lbe.created_at desc
                    ) as position
               from learner_badge_events lbe
              where lbe.user_id = $1
           )
           select bd.key, bd.title, bd.description, latest.occurred_at as unlocked_at,
                  latest.explanation
             from latest
             join badge_definitions bd on bd.id = latest.badge_definition_id
            where latest.position = 1 and latest.action = 'unlocked'
            order by latest.occurred_at desc`,
          [userId],
        );

        const levels = await database.query<{
          level_id: string;
          level_version_id: string;
          title: string;
          best_awarded_points: number;
          max_points: number;
          completion_count: number;
          last_completed_at: Date | null;
        }>(
          `select llp.level_id, llp.level_version_id, lv.title, llp.best_awarded_points,
                  llp.max_points, llp.completion_count, llp.last_completed_at
             from learner_level_progress llp
             join level_versions lv on lv.id = llp.level_version_id
            where llp.user_id = $1
            order by llp.updated_at desc
            limit $2`,
          [userId, capabilities.levelHistoryLimit],
        );

        const resume = await database.query<{
          session_id: string;
          level_id: string;
          title: string;
          current_challenge_ordinal: number;
          awarded_points: number;
          max_points: number;
          last_activity_at: Date;
        }>(
          `select lps.id as session_id, lps.level_id, lv.title,
                  lps.current_challenge_ordinal, lps.awarded_points, lps.max_points,
                  lps.last_activity_at
             from level_play_sessions lps
             join level_versions lv on lv.id = lps.level_version_id
            where lps.user_id = $1
              and lps.state = 'active'
              and lps.expires_at > $2
            order by lps.last_activity_at desc
            limit 1`,
          [userId, generatedAt],
        );
        const resumeRow = resume.rows[0] ?? null;

        return ProgressSummaryViewSchema.parse({
          generatedAt: generatedAt.toISOString(),
          capabilities,
          pointsBalance: balance,
          streak: {
            currentDays: streak.current_days,
            longestDays: streak.longest_days,
            lastQualifiedDate: streak.last_qualified_date,
            graceCredits: streak.grace_credits,
            timezone: streak.timezone,
          },
          badges: badges.rows.map((badge) => ({
            key: badge.key,
            title: badge.title,
            description: badge.description,
            unlockedAt: badge.unlocked_at.toISOString(),
            explanation: badge.explanation,
          })),
          levels: levels.rows.map((level) => ({
            levelId: level.level_id,
            levelVersionId: level.level_version_id,
            title: level.title,
            bestAwardedPoints: level.best_awarded_points,
            maxPoints: level.max_points,
            completionCount: level.completion_count,
            lastCompletedAt: level.last_completed_at?.toISOString() ?? null,
          })),
          resume: resumeRow
            ? {
                sessionId: resumeRow.session_id,
                levelId: resumeRow.level_id,
                title: resumeRow.title,
                currentChallengeOrdinal: resumeRow.current_challenge_ordinal,
                awardedPoints: resumeRow.awarded_points,
                maxPoints: resumeRow.max_points,
                lastActivityAt: resumeRow.last_activity_at.toISOString(),
              }
            : null,
          leaderboard: {
            leaderboardOptIn: settings.leaderboard_opt_in,
            leaderboardAlias: settings.leaderboard_alias,
            leaderboardStatus: settings.leaderboard_status,
          },
        });
      }),

    ledger: async (userId) =>
      transaction(options.pool, async (database) => {
        const settings = await ensureSettings(database, userId);
        const limit = progressCapabilities(settings.tier).ledgerHistoryLimit;
        const entries = await database.query<{
          id: string;
          points_delta: number;
          reason_code: string;
          explanation: string;
          source_type: "level_completion" | "badge" | "manual_adjustment" | "correction";
          occurred_at: Date;
          correction_of_id: string | null;
        }>(
          `select id, points_delta, reason_code, explanation, source_type, occurred_at,
                  correction_of_id
             from points_ledger
            where user_id = $1
            order by occurred_at desc, created_at desc
            limit $2`,
          [userId, limit],
        );

        return ProgressLedgerViewSchema.parse({
          limit,
          entries: entries.rows.map((entry) => ({
            id: entry.id,
            pointsDelta: entry.points_delta,
            reasonCode: entry.reason_code,
            explanation: entry.explanation,
            sourceType: entry.source_type,
            occurredAt: entry.occurred_at.toISOString(),
            correctionOfId: entry.correction_of_id,
          })),
        });
      }),

    leaderboard: async (period) =>
      transaction(options.pool, async (database) => {
        const generatedAt = now();
        const start = leaderboardPeriodStart(period, generatedAt);
        const entries = await database.query<{
          rank: number;
          alias: string;
          points: number;
        }>(
          `with totals as (
             select lps.leaderboard_alias as alias,
                    coalesce(sum(pl.points_delta), 0)::int as points
               from learner_progress_settings lps
               join points_ledger pl on pl.user_id = lps.user_id
              where lps.leaderboard_opt_in = true
                and lps.leaderboard_status = 'eligible'
                and lps.leaderboard_alias is not null
                and ($1::timestamptz is null or pl.occurred_at >= $1)
              group by lps.leaderboard_alias
           )
           select (rank() over (order by points desc))::int as rank, alias, points
             from totals
            where points > 0
            order by rank, alias
            limit 100`,
          [start],
        );

        return LeaderboardViewSchema.parse({
          period,
          generatedAt: generatedAt.toISOString(),
          entries: entries.rows,
        });
      }),

    updatePreferences: async (userId, inputValue) =>
      transaction(options.pool, async (database) => {
        const input = UpdatePreferencesSchema.parse(inputValue);
        const current = await ensureSettings(database, userId, true);
        const timezone = input.timezone ?? current.timezone;
        if (!isValidTimeZone(timezone)) {
          throw new ProgressServiceError(400, "A valid IANA timezone is required.");
        }
        const leaderboardAlias =
          input.leaderboardAlias === undefined ? current.leaderboard_alias : input.leaderboardAlias;
        const leaderboardOptIn = input.leaderboardOptIn ?? current.leaderboard_opt_in;
        if (leaderboardOptIn && !leaderboardAlias) {
          throw new ProgressServiceError(400, "A leaderboard alias is required before opting in.");
        }

        if (leaderboardAlias) {
          const duplicate = await database.query<{ user_id: string }>(
            `select user_id
               from learner_progress_settings
              where lower(leaderboard_alias) = lower($1) and user_id <> $2
              limit 1`,
            [leaderboardAlias, userId],
          );
          if (duplicate.rows[0]) {
            throw new ProgressServiceError(409, "That leaderboard alias is already in use.");
          }
        }

        const updated = await database.query<SettingsRow>(
          `update learner_progress_settings
              set timezone = $2,
                  leaderboard_opt_in = $3,
                  leaderboard_alias = $4,
                  updated_at = $5
            where user_id = $1
            returning user_id, timezone, tier, leaderboard_opt_in, leaderboard_alias,
                      leaderboard_status`,
          [userId, timezone, leaderboardOptIn, leaderboardAlias, now()],
        );
        const settings = updated.rows[0];
        if (!settings)
          throw new ProgressServiceError(500, "Progress settings could not be updated.");

        await database.query(
          `insert into learner_streaks
            (user_id, timezone, current_days, longest_days, last_qualified_date, grace_credits, updated_at)
           values ($1, $2, 0, 0, null, 1, $3)
           on conflict (user_id) do update
             set timezone = excluded.timezone,
                 updated_at = excluded.updated_at`,
          [userId, timezone, now()],
        );
        return settingsView(settings);
      }),
  };
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [candidateName, ...valueParts] = part.trim().split("=");
    if (candidateName === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

function requireTrustedOrigin(request: FastifyRequest, config: ApiConfig): void {
  const origin = request.headers.origin;
  if (!origin) return;
  if (origin !== new URL(config.PUBLIC_APP_URL).origin) {
    throw new ProgressServiceError(403, "The request origin is not allowed.");
  }
}

async function requireLearner(
  request: FastifyRequest,
  config: ApiConfig,
  authService: AuthService,
): Promise<AuthenticatedLearner> {
  const sessionToken = parseCookie(request.headers.cookie, config.SESSION_COOKIE_NAME);
  if (!sessionToken) throw new ProgressServiceError(401, "Authentication is required.");
  const learner = await authService.resolveSession(sessionToken);
  if (!learner) throw new ProgressServiceError(401, "The session is invalid or expired.");
  return learner;
}

export function registerProgressRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    progressService: ProgressService;
  }>,
): void {
  app.get("/v1/progress/summary", async (request) => {
    const learner = await requireLearner(request, options.config, options.authService);
    return options.progressService.summary(learner.id);
  });

  app.get("/v1/progress/ledger", async (request) => {
    const learner = await requireLearner(request, options.config, options.authService);
    return options.progressService.ledger(learner.id);
  });

  app.get("/v1/progress/leaderboard", async (request) => {
    await requireLearner(request, options.config, options.authService);
    const query = z
      .object({ period: LeaderboardPeriodSchema.default("week") })
      .parse(request.query);
    return options.progressService.leaderboard(query.period);
  });

  app.patch("/v1/progress/preferences", async (request) => {
    requireTrustedOrigin(request, options.config);
    const learner = await requireLearner(request, options.config, options.authService);
    return options.progressService.updatePreferences(
      learner.id,
      UpdatePreferencesSchema.parse(request.body ?? {}),
    );
  });
}
