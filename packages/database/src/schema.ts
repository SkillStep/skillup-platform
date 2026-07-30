import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const contentStatuses = ["draft", "in_review", "published", "archived"] as const;
const locales = ["en", "ur"] as const;
const userStatuses = ["active", "deletion_requested", "deleted"] as const;
const authChallengePurposes = ["sign_in"] as const;
const ageBands = ["16_17", "18_24", "25_34", "35_plus", "unspecified"] as const;
const onboardingStatuses = ["not_started", "in_progress", "completed"] as const;

export type ContentStatus = (typeof contentStatuses)[number];
export type ContentLocale = (typeof locales)[number];
export type UserStatus = (typeof userStatuses)[number];
export type AuthChallengePurpose = (typeof authChallengePurposes)[number];
export type AgeBand = (typeof ageBands)[number];
export type OnboardingStatus = (typeof onboardingStatuses)[number];

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    status: text("status").$type<ContentStatus>().notNull().default("draft"),
    defaultLocale: text("default_locale").$type<ContentLocale>().notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("skills_slug_unique").on(table.slug),
    check("skills_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check(
      "skills_status_allowed",
      sql`${table.status} in ('draft', 'in_review', 'published', 'archived')`,
    ),
    check("skills_locale_allowed", sql`${table.defaultLocale} in ('en', 'ur')`),
  ],
);

export const skillVersions = pgTable(
  "skill_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    locale: text("locale").$type<ContentLocale>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    status: text("status").$type<ContentStatus>().notNull().default("draft"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("skill_versions_identity_unique").on(table.skillId, table.version, table.locale),
    check("skill_versions_positive_version", sql`${table.version} > 0`),
    check("skill_versions_locale_allowed", sql`${table.locale} in ('en', 'ur')`),
    check(
      "skill_versions_status_allowed",
      sql`${table.status} in ('draft', 'in_review', 'published', 'archived')`,
    ),
    check("skill_versions_title_length", sql`char_length(${table.title}) between 3 and 100`),
    check("skill_versions_summary_length", sql`char_length(${table.summary}) between 40 and 300`),
  ],
);

export const learningPaths = pgTable(
  "learning_paths",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    status: text("status").$type<ContentStatus>().notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learning_paths_slug_unique").on(table.slug),
    check("learning_paths_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check(
      "learning_paths_status_allowed",
      sql`${table.status} in ('draft', 'in_review', 'published', 'archived')`,
    ),
    check("learning_paths_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const learningPathVersions = pgTable(
  "learning_path_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    learningPathId: uuid("learning_path_id")
      .notNull()
      .references(() => learningPaths.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    locale: text("locale").$type<ContentLocale>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull(),
    status: text("status").$type<ContentStatus>().notNull().default("draft"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learning_path_versions_identity_unique").on(
      table.learningPathId,
      table.version,
      table.locale,
    ),
    check("learning_path_versions_positive_version", sql`${table.version} > 0`),
    check("learning_path_versions_locale_allowed", sql`${table.locale} in ('en', 'ur')`),
    check(
      "learning_path_versions_status_allowed",
      sql`${table.status} in ('draft', 'in_review', 'published', 'archived')`,
    ),
    check(
      "learning_path_versions_estimated_minutes",
      sql`${table.estimatedMinutes} between 5 and 3000`,
    ),
    check(
      "learning_path_versions_title_length",
      sql`char_length(${table.title}) between 3 and 120`,
    ),
    check(
      "learning_path_versions_summary_length",
      sql`char_length(${table.summary}) between 40 and 300`,
    ),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: text("status").$type<UserStatus>().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "users_status_allowed",
      sql`${table.status} in ('active', 'deletion_requested', 'deleted')`,
    ),
  ],
);

export const userEmailIdentities = pgTable(
  "user_email_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emailNormalized: text("email_normalized").notNull(),
    emailDisplay: text("email_display").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_email_identities_email_unique").on(table.emailNormalized),
    uniqueIndex("user_email_identities_user_unique").on(table.userId),
    check(
      "user_email_identities_normalized_email",
      sql`${table.emailNormalized} = lower(btrim(${table.emailNormalized}))`,
    ),
    check(
      "user_email_identities_email_length",
      sql`char_length(${table.emailNormalized}) between 3 and 254`,
    ),
  ],
);

export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid("id").primaryKey(),
    emailNormalized: text("email_normalized").notNull(),
    purpose: text("purpose").$type<AuthChallengePurpose>().notNull().default("sign_in"),
    secretDigest: text("secret_digest").notNull(),
    requestFingerprintDigest: text("request_fingerprint_digest").notNull(),
    attemptsRemaining: integer("attempts_remaining").notNull().default(5),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("auth_challenges_email_created_idx").on(table.emailNormalized, table.createdAt),
    index("auth_challenges_fingerprint_created_idx").on(
      table.requestFingerprintDigest,
      table.createdAt,
    ),
    check("auth_challenges_purpose_allowed", sql`${table.purpose} in ('sign_in')`),
    check("auth_challenges_attempts_range", sql`${table.attemptsRemaining} between 0 and 5`),
    check("auth_challenges_secret_digest_length", sql`char_length(${table.secretDigest}) = 64`),
    check(
      "auth_challenges_fingerprint_digest_length",
      sql`char_length(${table.requestFingerprintDigest}) = 64`,
    ),
    check("auth_challenges_expiry_after_creation", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenDigest: text("token_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_digest_unique").on(table.tokenDigest),
    index("auth_sessions_user_idx").on(table.userId),
    check("auth_sessions_token_digest_length", sql`char_length(${table.tokenDigest}) = 64`),
    check(
      "auth_sessions_absolute_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "auth_sessions_idle_expiry_after_creation",
      sql`${table.idleExpiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const learnerProfiles = pgTable(
  "learner_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    locale: text("locale").$type<ContentLocale>().notNull().default("en"),
    ageBand: text("age_band").$type<AgeBand>().notNull().default("unspecified"),
    avatarKey: text("avatar_key"),
    learningGoal: text("learning_goal"),
    onboardingStatus: text("onboarding_status")
      .$type<OnboardingStatus>()
      .notNull()
      .default("not_started"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("learner_profiles_locale_allowed", sql`${table.locale} in ('en', 'ur')`),
    check(
      "learner_profiles_age_band_allowed",
      sql`${table.ageBand} in ('16_17', '18_24', '25_34', '35_plus', 'unspecified')`,
    ),
    check(
      "learner_profiles_onboarding_status_allowed",
      sql`${table.onboardingStatus} in ('not_started', 'in_progress', 'completed')`,
    ),
    check(
      "learner_profiles_display_name_length",
      sql`${table.displayName} is null or char_length(${table.displayName}) between 2 and 60`,
    ),
    check(
      "learner_profiles_learning_goal_length",
      sql`${table.learningGoal} is null or char_length(${table.learningGoal}) between 3 and 240`,
    ),
    check(
      "learner_profiles_avatar_key_format",
      sql`${table.avatarKey} is null or ${table.avatarKey} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
  ],
);
