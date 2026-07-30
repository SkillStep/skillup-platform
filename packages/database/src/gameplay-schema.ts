import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { challengeVersions, challenges, levels, levelVersions } from "./learning-schema.js";
import { users } from "./schema.js";

const gameplaySessionStates = ["active", "completed", "abandoned", "expired"] as const;
const gameplayAttemptStatuses = ["correct", "incorrect", "needs_review"] as const;

export type GameplaySessionState = (typeof gameplaySessionStates)[number];
export type GameplayAttemptStatus = (typeof gameplayAttemptStatuses)[number];

export const levelPlaySessions = pgTable(
  "level_play_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "restrict" }),
    levelVersionId: uuid("level_version_id")
      .notNull()
      .references(() => levelVersions.id, { onDelete: "restrict" }),
    state: text("state").$type<GameplaySessionState>().notNull().default("active"),
    currentChallengeOrdinal: integer("current_challenge_ordinal").notNull().default(0),
    awardedPoints: integer("awarded_points").notNull().default(0),
    maxPoints: integer("max_points").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("level_play_sessions_user_activity_idx").on(table.userId, table.lastActivityAt),
    index("level_play_sessions_level_version_idx").on(table.levelVersionId),
    check(
      "level_play_sessions_state_allowed",
      sql`${table.state} in ('active', 'completed', 'abandoned', 'expired')`,
    ),
    check(
      "level_play_sessions_challenge_ordinal_nonnegative",
      sql`${table.currentChallengeOrdinal} >= 0`,
    ),
    check(
      "level_play_sessions_points_valid",
      sql`${table.awardedPoints} >= 0 and ${table.maxPoints} >= 0 and ${table.awardedPoints} <= ${table.maxPoints}`,
    ),
    check("level_play_sessions_expiry_valid", sql`${table.expiresAt} > ${table.startedAt}`),
    check(
      "level_play_sessions_completion_metadata",
      sql`(${table.state} = 'completed' and ${table.completedAt} is not null) or (${table.state} <> 'completed')`,
    ),
  ],
);

export const levelSessionChallenges = pgTable(
  "level_session_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => levelPlaySessions.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "restrict" }),
    challengeVersionId: uuid("challenge_version_id")
      .notNull()
      .references(() => challengeVersions.id, { onDelete: "restrict" }),
    maxAttempts: integer("max_attempts").notNull().default(2),
    maxPoints: integer("max_points").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("level_session_challenges_ordinal_unique").on(table.sessionId, table.ordinal),
    uniqueIndex("level_session_challenges_version_unique").on(
      table.sessionId,
      table.challengeVersionId,
    ),
    index("level_session_challenges_challenge_idx").on(table.challengeVersionId),
    check("level_session_challenges_ordinal_nonnegative", sql`${table.ordinal} >= 0`),
    check("level_session_challenges_attempt_range", sql`${table.maxAttempts} between 1 and 20`),
    check("level_session_challenges_points_range", sql`${table.maxPoints} between 0 and 1000`),
  ],
);

export const challengeAttempts = pgTable(
  "challenge_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => levelPlaySessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "restrict" }),
    challengeVersionId: uuid("challenge_version_id")
      .notNull()
      .references(() => challengeVersions.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<GameplayAttemptStatus>().notNull(),
    awardedPoints: integer("awarded_points").notNull().default(0),
    maxPoints: integer("max_points").notNull(),
    explanation: text("explanation").notNull(),
    retryAllowed: boolean("retry_allowed").notNull().default(false),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("challenge_attempts_idempotency_unique").on(table.sessionId, table.idempotencyKey),
    uniqueIndex("challenge_attempts_number_unique").on(
      table.sessionId,
      table.challengeVersionId,
      table.attemptNumber,
    ),
    index("challenge_attempts_user_activity_idx").on(table.userId, table.evaluatedAt),
    check("challenge_attempts_number_positive", sql`${table.attemptNumber} > 0`),
    check("challenge_attempts_request_hash_length", sql`char_length(${table.requestHash}) = 64`),
    check(
      "challenge_attempts_response_object",
      sql`jsonb_typeof(${table.responsePayload}) = 'object'`,
    ),
    check(
      "challenge_attempts_status_allowed",
      sql`${table.status} in ('correct', 'incorrect', 'needs_review')`,
    ),
    check(
      "challenge_attempts_points_valid",
      sql`${table.awardedPoints} >= 0 and ${table.maxPoints} >= 0 and ${table.awardedPoints} <= ${table.maxPoints}`,
    ),
    check(
      "challenge_attempts_explanation_length",
      sql`char_length(${table.explanation}) between 1 and 1000`,
    ),
    check(
      "challenge_attempts_review_not_scored",
      sql`${table.status} <> 'needs_review' or (${table.awardedPoints} = 0 and ${table.retryAllowed} = false)`,
    ),
  ],
);

export const learnerLevelProgress = pgTable(
  "learner_level_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "restrict" }),
    levelVersionId: uuid("level_version_id")
      .notNull()
      .references(() => levelVersions.id, { onDelete: "restrict" }),
    bestAwardedPoints: integer("best_awarded_points").notNull().default(0),
    maxPoints: integer("max_points").notNull(),
    completionCount: integer("completion_count").notNull().default(0),
    lastSessionId: uuid("last_session_id").references(() => levelPlaySessions.id, {
      onDelete: "set null",
    }),
    firstCompletedAt: timestamp("first_completed_at", { withTimezone: true }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learner_level_progress_version_unique").on(table.userId, table.levelVersionId),
    index("learner_level_progress_user_idx").on(table.userId, table.updatedAt),
    check(
      "learner_level_progress_points_valid",
      sql`${table.bestAwardedPoints} >= 0 and ${table.maxPoints} >= 0 and ${table.bestAwardedPoints} <= ${table.maxPoints}`,
    ),
    check("learner_level_progress_count_nonnegative", sql`${table.completionCount} >= 0`),
    check(
      "learner_level_progress_completion_metadata",
      sql`(${table.completionCount} = 0 and ${table.firstCompletedAt} is null and ${table.lastCompletedAt} is null) or (${table.completionCount} > 0 and ${table.firstCompletedAt} is not null and ${table.lastCompletedAt} is not null)`,
    ),
  ],
);
