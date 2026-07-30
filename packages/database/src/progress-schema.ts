import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { levels } from "./learning-schema.js";
import { levelPlaySessions } from "./gameplay-schema.js";
import { users } from "./schema.js";

const enrollmentStates = ["enrolled", "in_progress", "completed", "paused"] as const;
const progressTiers = ["free", "premium"] as const;
const leaderboardStatuses = ["eligible", "suspended"] as const;
const pointsSourceTypes = ["level_completion", "badge", "manual_adjustment", "correction"] as const;
const streakEventTypes = ["qualified", "grace", "correction"] as const;
const badgeStates = ["active", "retired"] as const;
const badgeRuleKinds = ["first_level", "perfect_level", "streak_days", "points_total"] as const;
const badgeEventActions = ["unlocked", "revoked", "corrected"] as const;

export type EnrollmentState = (typeof enrollmentStates)[number];
export type ProgressTier = (typeof progressTiers)[number];
export type LeaderboardStatus = (typeof leaderboardStatuses)[number];
export type PointsSourceType = (typeof pointsSourceTypes)[number];
export type StreakEventType = (typeof streakEventTypes)[number];
export type BadgeState = (typeof badgeStates)[number];
export type BadgeRuleKind = (typeof badgeRuleKinds)[number];
export type BadgeEventAction = (typeof badgeEventActions)[number];

export const learnerEnrollments = pgTable(
  "learner_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "restrict" }),
    state: text("state").$type<EnrollmentState>().notNull().default("enrolled"),
    lastSessionId: uuid("last_session_id").references(() => levelPlaySessions.id, {
      onDelete: "set null",
    }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learner_enrollments_user_level_unique").on(table.userId, table.levelId),
    index("learner_enrollments_user_state_idx").on(table.userId, table.state, table.updatedAt),
    check(
      "learner_enrollments_state_allowed",
      sql`${table.state} in ('enrolled', 'in_progress', 'completed', 'paused')`,
    ),
    check(
      "learner_enrollments_completion_metadata",
      sql`(${table.state} = 'completed' and ${table.completedAt} is not null) or (${table.state} <> 'completed')`,
    ),
  ],
);

export const learnerProgressSettings = pgTable(
  "learner_progress_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("UTC"),
    tier: text("tier").$type<ProgressTier>().notNull().default("free"),
    leaderboardOptIn: boolean("leaderboard_opt_in").notNull().default(false),
    leaderboardAlias: text("leaderboard_alias"),
    leaderboardStatus: text("leaderboard_status")
      .$type<LeaderboardStatus>()
      .notNull()
      .default("eligible"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learner_progress_settings_alias_unique").on(table.leaderboardAlias),
    check(
      "learner_progress_settings_timezone_length",
      sql`char_length(${table.timezone}) between 3 and 64`,
    ),
    check(
      "learner_progress_settings_timezone_format",
      sql`${table.timezone} ~ '^[A-Za-z0-9_+./-]+$'`,
    ),
    check("learner_progress_settings_tier_allowed", sql`${table.tier} in ('free', 'premium')`),
    check(
      "learner_progress_settings_leaderboard_status_allowed",
      sql`${table.leaderboardStatus} in ('eligible', 'suspended')`,
    ),
    check(
      "learner_progress_settings_alias_format",
      sql`${table.leaderboardAlias} is null or ${table.leaderboardAlias} ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$'`,
    ),
    check(
      "learner_progress_settings_opt_in_alias",
      sql`${table.leaderboardOptIn} = false or ${table.leaderboardAlias} is not null`,
    ),
  ],
);

export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    sourceType: text("source_type").$type<PointsSourceType>().notNull(),
    sourceId: uuid("source_id"),
    pointsDelta: integer("points_delta").notNull(),
    reasonCode: text("reason_code").notNull(),
    explanation: text("explanation").notNull(),
    correctionOfId: uuid("correction_of_id").references((): AnyPgColumn => pointsLedger.id, {
      onDelete: "restrict",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("points_ledger_event_key_unique").on(table.eventKey),
    index("points_ledger_user_occurred_idx").on(table.userId, table.occurredAt),
    index("points_ledger_source_idx").on(table.sourceType, table.sourceId),
    check(
      "points_ledger_source_type_allowed",
      sql`${table.sourceType} in ('level_completion', 'badge', 'manual_adjustment', 'correction')`,
    ),
    check(
      "points_ledger_delta_range",
      sql`${table.pointsDelta} between -100000 and 100000 and ${table.pointsDelta} <> 0`,
    ),
    check("points_ledger_event_key_length", sql`char_length(${table.eventKey}) between 8 and 180`),
    check("points_ledger_reason_code_format", sql`${table.reasonCode} ~ '^[a-z0-9_]{3,60}$'`),
    check(
      "points_ledger_explanation_length",
      sql`char_length(${table.explanation}) between 3 and 500`,
    ),
    check(
      "points_ledger_correction_metadata",
      sql`(${table.sourceType} = 'correction' and ${table.correctionOfId} is not null) or (${table.sourceType} <> 'correction' and ${table.correctionOfId} is null)`,
    ),
  ],
);

export const learnerStreaks = pgTable(
  "learner_streaks",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("UTC"),
    currentDays: integer("current_days").notNull().default(0),
    longestDays: integer("longest_days").notNull().default(0),
    lastQualifiedDate: date("last_qualified_date"),
    graceCredits: integer("grace_credits").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("learner_streaks_timezone_length", sql`char_length(${table.timezone}) between 3 and 64`),
    check(
      "learner_streaks_counts_valid",
      sql`${table.currentDays} >= 0 and ${table.longestDays} >= ${table.currentDays} and ${table.graceCredits} between 0 and 3`,
    ),
    check(
      "learner_streaks_date_metadata",
      sql`(${table.currentDays} = 0 and ${table.lastQualifiedDate} is null) or (${table.currentDays} > 0 and ${table.lastQualifiedDate} is not null)`,
    ),
  ],
);

export const streakEvents = pgTable(
  "streak_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").$type<StreakEventType>().notNull(),
    sourceId: uuid("source_id"),
    localDate: date("local_date").notNull(),
    timezone: text("timezone").notNull(),
    explanation: text("explanation").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("streak_events_event_key_unique").on(table.eventKey),
    index("streak_events_user_date_idx").on(table.userId, table.localDate),
    check(
      "streak_events_type_allowed",
      sql`${table.eventType} in ('qualified', 'grace', 'correction')`,
    ),
    check("streak_events_timezone_length", sql`char_length(${table.timezone}) between 3 and 64`),
    check(
      "streak_events_explanation_length",
      sql`char_length(${table.explanation}) between 3 and 500`,
    ),
  ],
);

export const badgeDefinitions = pgTable(
  "badge_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    state: text("state").$type<BadgeState>().notNull().default("active"),
    ruleKind: text("rule_kind").$type<BadgeRuleKind>().notNull(),
    threshold: integer("threshold").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("badge_definitions_key_unique").on(table.key),
    check("badge_definitions_key_format", sql`${table.key} ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'`),
    check("badge_definitions_state_allowed", sql`${table.state} in ('active', 'retired')`),
    check(
      "badge_definitions_rule_allowed",
      sql`${table.ruleKind} in ('first_level', 'perfect_level', 'streak_days', 'points_total')`,
    ),
    check("badge_definitions_threshold_positive", sql`${table.threshold} > 0`),
    check("badge_definitions_title_length", sql`char_length(${table.title}) between 3 and 80`),
    check(
      "badge_definitions_description_length",
      sql`char_length(${table.description}) between 10 and 300`,
    ),
  ],
);

export const learnerBadgeEvents = pgTable(
  "learner_badge_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badgeDefinitionId: uuid("badge_definition_id")
      .notNull()
      .references(() => badgeDefinitions.id, { onDelete: "restrict" }),
    eventKey: text("event_key").notNull(),
    action: text("action").$type<BadgeEventAction>().notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    explanation: text("explanation").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learner_badge_events_event_key_unique").on(table.eventKey),
    index("learner_badge_events_user_badge_idx").on(
      table.userId,
      table.badgeDefinitionId,
      table.occurredAt,
    ),
    check(
      "learner_badge_events_action_allowed",
      sql`${table.action} in ('unlocked', 'revoked', 'corrected')`,
    ),
    check("learner_badge_events_evidence_object", sql`jsonb_typeof(${table.evidence}) = 'object'`),
    check(
      "learner_badge_events_explanation_length",
      sql`char_length(${table.explanation}) between 3 and 500`,
    ),
  ],
);
