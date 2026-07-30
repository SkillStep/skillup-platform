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

import { learningPaths, learningPathVersions, skills, skillVersions } from "./schema.js";

const editorialStates = [
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "superseded",
  "archived",
  "rejected",
] as const;
const locales = ["en", "ur"] as const;
const indexPolicies = ["index", "noindex"] as const;
const challengeTypes = [
  "multiple_choice",
  "true_false",
  "ordering",
  "matching",
  "scenario",
  "fill_blank",
  "short_response",
] as const;
const sourceKinds = ["internal_editorial", "primary", "official", "research"] as const;

export type EditorialState = (typeof editorialStates)[number];
export type LearningLocale = (typeof locales)[number];
export type IndexPolicy = (typeof indexPolicies)[number];
export type LearningChallengeType = (typeof challengeTypes)[number];
export type SourceKind = (typeof sourceKinds)[number];

export const skillCategories = pgTable(
  "skill_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    defaultLocale: text("default_locale").$type<LearningLocale>().notNull().default("en"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("skill_categories_slug_unique").on(table.slug),
    check("skill_categories_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("skill_categories_locale_allowed", sql`${table.defaultLocale} in ('en', 'ur')`),
    check("skill_categories_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const skillCategoryVersions = pgTable(
  "skill_category_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => skillCategories.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    locale: text("locale").$type<LearningLocale>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    state: text("state").$type<EditorialState>().notNull().default("draft"),
    indexPolicy: text("index_policy").$type<IndexPolicy>().notNull().default("noindex"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("skill_category_versions_identity_unique").on(
      table.categoryId,
      table.version,
      table.locale,
    ),
    check("skill_category_versions_positive_version", sql`${table.version} > 0`),
    check("skill_category_versions_locale_allowed", sql`${table.locale} in ('en', 'ur')`),
    check(
      "skill_category_versions_state_allowed",
      sql`${table.state} in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')`,
    ),
    check(
      "skill_category_versions_index_policy",
      sql`${table.indexPolicy} in ('index', 'noindex')`,
    ),
    check(
      "skill_category_versions_title_length",
      sql`char_length(${table.title}) between 3 and 100`,
    ),
    check(
      "skill_category_versions_summary_length",
      sql`char_length(${table.summary}) between 40 and 300`,
    ),
    check(
      "skill_category_versions_publication_metadata",
      sql`(${table.state} <> 'published') or (${table.reviewedAt} is not null and ${table.publishedAt} is not null)`,
    ),
  ],
);

export const skillCategoryMemberships = pgTable(
  "skill_category_memberships",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references(() => skillCategories.id, { onDelete: "restrict" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("skill_category_memberships_skill_unique").on(table.skillId),
    uniqueIndex("skill_category_memberships_order_unique").on(table.categoryId, table.sortOrder),
    check("skill_category_memberships_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const learningModules = pgTable(
  "learning_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    learningPathId: uuid("learning_path_id")
      .notNull()
      .references(() => learningPaths.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learning_modules_path_slug_unique").on(table.learningPathId, table.slug),
    uniqueIndex("learning_modules_path_order_unique").on(table.learningPathId, table.sortOrder),
    check("learning_modules_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("learning_modules_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const learningModuleVersions = pgTable(
  "learning_module_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => learningModules.id, { onDelete: "cascade" }),
    learningPathVersionId: uuid("learning_path_version_id")
      .notNull()
      .references(() => learningPathVersions.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    locale: text("locale").$type<LearningLocale>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    state: text("state").$type<EditorialState>().notNull().default("draft"),
    indexPolicy: text("index_policy").$type<IndexPolicy>().notNull().default("noindex"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learning_module_versions_identity_unique").on(
      table.moduleId,
      table.version,
      table.locale,
    ),
    check("learning_module_versions_positive_version", sql`${table.version} > 0`),
    check("learning_module_versions_locale_allowed", sql`${table.locale} in ('en', 'ur')`),
    check(
      "learning_module_versions_state_allowed",
      sql`${table.state} in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')`,
    ),
    check(
      "learning_module_versions_index_policy",
      sql`${table.indexPolicy} in ('index', 'noindex')`,
    ),
    check(
      "learning_module_versions_title_length",
      sql`char_length(${table.title}) between 3 and 120`,
    ),
    check(
      "learning_module_versions_summary_length",
      sql`char_length(${table.summary}) between 40 and 300`,
    ),
    check(
      "learning_module_versions_publication_metadata",
      sql`(${table.state} <> 'published') or (${table.reviewedAt} is not null and ${table.publishedAt} is not null)`,
    ),
  ],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => learningModules.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lessons_module_slug_unique").on(table.moduleId, table.slug),
    uniqueIndex("lessons_module_order_unique").on(table.moduleId, table.sortOrder),
    check("lessons_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("lessons_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const lessonVersions = pgTable(
  "lesson_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    moduleVersionId: uuid("module_version_id")
      .notNull()
      .references(() => learningModuleVersions.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    locale: text("locale").$type<LearningLocale>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull(),
    state: text("state").$type<EditorialState>().notNull().default("draft"),
    indexPolicy: text("index_policy").$type<IndexPolicy>().notNull().default("noindex"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lesson_versions_identity_unique").on(table.lessonId, table.version, table.locale),
    check("lesson_versions_positive_version", sql`${table.version} > 0`),
    check("lesson_versions_locale_allowed", sql`${table.locale} in ('en', 'ur')`),
    check(
      "lesson_versions_state_allowed",
      sql`${table.state} in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')`,
    ),
    check("lesson_versions_index_policy", sql`${table.indexPolicy} in ('index', 'noindex')`),
    check("lesson_versions_title_length", sql`char_length(${table.title}) between 3 and 120`),
    check("lesson_versions_summary_length", sql`char_length(${table.summary}) between 40 and 300`),
    check("lesson_versions_estimated_minutes", sql`${table.estimatedMinutes} between 1 and 120`),
    check(
      "lesson_versions_publication_metadata",
      sql`(${table.state} <> 'published') or (${table.reviewedAt} is not null and ${table.publishedAt} is not null)`,
    ),
  ],
);

export const levels = pgTable(
  "levels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("levels_lesson_slug_unique").on(table.lessonId, table.slug),
    uniqueIndex("levels_lesson_order_unique").on(table.lessonId, table.sortOrder),
    check("levels_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("levels_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const levelVersions = pgTable(
  "level_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "cascade" }),
    lessonVersionId: uuid("lesson_version_id")
      .notNull()
      .references(() => lessonVersions.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    locale: text("locale").$type<LearningLocale>().notNull(),
    title: text("title").notNull(),
    publicSummary: text("public_summary").notNull(),
    instructions: text("instructions").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull(),
    state: text("state").$type<EditorialState>().notNull().default("draft"),
    indexPolicy: text("index_policy").$type<IndexPolicy>().notNull().default("noindex"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("level_versions_identity_unique").on(table.levelId, table.version, table.locale),
    check("level_versions_positive_version", sql`${table.version} > 0`),
    check("level_versions_locale_allowed", sql`${table.locale} in ('en', 'ur')`),
    check(
      "level_versions_state_allowed",
      sql`${table.state} in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')`,
    ),
    check("level_versions_index_policy", sql`${table.indexPolicy} in ('index', 'noindex')`),
    check("level_versions_title_length", sql`char_length(${table.title}) between 3 and 120`),
    check(
      "level_versions_public_summary_length",
      sql`char_length(${table.publicSummary}) between 40 and 300`,
    ),
    check(
      "level_versions_instructions_length",
      sql`char_length(${table.instructions}) between 20 and 1000`,
    ),
    check("level_versions_estimated_minutes", sql`${table.estimatedMinutes} between 1 and 20`),
    check(
      "level_versions_publication_metadata",
      sql`(${table.state} <> 'published') or (${table.reviewedAt} is not null and ${table.publishedAt} is not null)`,
    ),
  ],
);

export const learningObjectives = pgTable(
  "learning_objectives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    levelVersionId: uuid("level_version_id")
      .notNull()
      .references(() => levelVersions.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    statement: text("statement").notNull(),
    assessable: boolean("assessable").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learning_objectives_level_code_unique").on(table.levelVersionId, table.code),
    uniqueIndex("learning_objectives_level_order_unique").on(table.levelVersionId, table.sortOrder),
    check("learning_objectives_code_format", sql`${table.code} ~ '^[A-Z][A-Z0-9_]{2,39}$'`),
    check(
      "learning_objectives_statement_length",
      sql`char_length(${table.statement}) between 10 and 240`,
    ),
    check("learning_objectives_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const levelPrerequisites = pgTable(
  "level_prerequisites",
  {
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "cascade" }),
    prerequisiteLevelId: uuid("prerequisite_level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("level_prerequisites_edge_unique").on(table.levelId, table.prerequisiteLevelId),
    check("level_prerequisites_not_self", sql`${table.levelId} <> ${table.prerequisiteLevelId}`),
  ],
);

export const challenges = pgTable(
  "challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("challenges_level_slug_unique").on(table.levelId, table.slug),
    uniqueIndex("challenges_level_order_unique").on(table.levelId, table.sortOrder),
    check("challenges_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("challenges_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const challengeVersions = pgTable(
  "challenge_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    levelVersionId: uuid("level_version_id")
      .notNull()
      .references(() => levelVersions.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    locale: text("locale").$type<LearningLocale>().notNull(),
    type: text("type").$type<LearningChallengeType>().notNull(),
    prompt: text("prompt").notNull(),
    instruction: text("instruction"),
    explanation: text("explanation").notNull(),
    publicPayload: jsonb("public_payload").$type<Record<string, unknown>>().notNull().default({}),
    points: integer("points").notNull().default(10),
    state: text("state").$type<EditorialState>().notNull().default("draft"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("challenge_versions_identity_unique").on(
      table.challengeId,
      table.version,
      table.locale,
    ),
    check("challenge_versions_positive_version", sql`${table.version} > 0`),
    check("challenge_versions_locale_allowed", sql`${table.locale} in ('en', 'ur')`),
    check(
      "challenge_versions_type_allowed",
      sql`${table.type} in ('multiple_choice', 'true_false', 'ordering', 'matching', 'scenario', 'fill_blank', 'short_response')`,
    ),
    check(
      "challenge_versions_state_allowed",
      sql`${table.state} in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')`,
    ),
    check(
      "challenge_versions_prompt_length",
      sql`char_length(${table.prompt}) between 10 and 1000`,
    ),
    check(
      "challenge_versions_instruction_length",
      sql`${table.instruction} is null or char_length(${table.instruction}) between 3 and 300`,
    ),
    check(
      "challenge_versions_explanation_length",
      sql`char_length(${table.explanation}) between 20 and 1000`,
    ),
    check("challenge_versions_points_range", sql`${table.points} between 0 and 1000`),
    check(
      "challenge_versions_public_payload_object",
      sql`jsonb_typeof(${table.publicPayload}) = 'object'`,
    ),
    check(
      "challenge_versions_publication_metadata",
      sql`(${table.state} <> 'published') or (${table.reviewedAt} is not null and ${table.publishedAt} is not null)`,
    ),
  ],
);

export const challengeAnswerOptions = pgTable(
  "challenge_answer_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    challengeVersionId: uuid("challenge_version_id")
      .notNull()
      .references(() => challengeVersions.id, { onDelete: "cascade" }),
    optionKey: text("option_key").notNull(),
    label: text("label").notNull(),
    accessibleLabel: text("accessible_label"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("challenge_answer_options_key_unique").on(
      table.challengeVersionId,
      table.optionKey,
    ),
    uniqueIndex("challenge_answer_options_order_unique").on(
      table.challengeVersionId,
      table.sortOrder,
    ),
    check("challenge_answer_options_key_format", sql`${table.optionKey} ~ '^[a-z0-9_]{1,40}$'`),
    check(
      "challenge_answer_options_label_length",
      sql`char_length(${table.label}) between 1 and 500`,
    ),
    check(
      "challenge_answer_options_accessible_label_length",
      sql`${table.accessibleLabel} is null or char_length(${table.accessibleLabel}) between 1 and 500`,
    ),
    check("challenge_answer_options_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const challengeEvaluations = pgTable(
  "challenge_evaluations",
  {
    challengeVersionId: uuid("challenge_version_id")
      .primaryKey()
      .references(() => challengeVersions.id, { onDelete: "cascade" }),
    evaluator: text("evaluator").notNull().default("deterministic_v1"),
    privateEvaluation: jsonb("private_evaluation").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "challenge_evaluations_evaluator_format",
      sql`${table.evaluator} ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'`,
    ),
    check(
      "challenge_evaluations_private_object",
      sql`jsonb_typeof(${table.privateEvaluation}) = 'object' and ${table.privateEvaluation} <> '{}'::jsonb`,
    ),
  ],
);

export const contentSourceReferences = pgTable(
  "content_source_references",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    levelVersionId: uuid("level_version_id").references(() => levelVersions.id, {
      onDelete: "cascade",
    }),
    challengeVersionId: uuid("challenge_version_id").references(() => challengeVersions.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").$type<SourceKind>().notNull(),
    title: text("title").notNull(),
    publisher: text("publisher"),
    url: text("url"),
    locator: text("locator"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("content_source_references_level_idx").on(table.levelVersionId),
    index("content_source_references_challenge_idx").on(table.challengeVersionId),
    check(
      "content_source_references_one_owner",
      sql`num_nonnulls(${table.levelVersionId}, ${table.challengeVersionId}) = 1`,
    ),
    check(
      "content_source_references_kind_allowed",
      sql`${table.kind} in ('internal_editorial', 'primary', 'official', 'research')`,
    ),
    check(
      "content_source_references_title_length",
      sql`char_length(${table.title}) between 3 and 300`,
    ),
    check(
      "content_source_references_external_url",
      sql`${table.url} is null or ${table.url} ~ '^https://[^[:space:]]+$'`,
    ),
    check("content_source_references_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const contentPublicationRecords = pgTable(
  "content_publication_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: text("entity_type").notNull(),
    entityVersionId: uuid("entity_version_id").notNull(),
    state: text("state").$type<EditorialState>().notNull().default("draft"),
    indexPolicy: text("index_policy").$type<IndexPolicy>().notNull().default("noindex"),
    canonicalPath: text("canonical_path"),
    sourceVersionId: uuid("source_version_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_publication_records_entity_unique").on(
      table.entityType,
      table.entityVersionId,
    ),
    check(
      "content_publication_records_entity_type",
      sql`${table.entityType} in ('skill_category_version', 'skill_version', 'learning_path_version', 'module_version', 'lesson_version', 'level_version', 'challenge_version')`,
    ),
    check(
      "content_publication_records_state_allowed",
      sql`${table.state} in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')`,
    ),
    check(
      "content_publication_records_index_policy",
      sql`${table.indexPolicy} in ('index', 'noindex')`,
    ),
    check(
      "content_publication_records_canonical_path",
      sql`${table.canonicalPath} is null or ${table.canonicalPath} ~ '^/(en|ur)/[a-z0-9/-]+$'`,
    ),
    check(
      "content_publication_records_publication_metadata",
      sql`(${table.state} <> 'published') or (${table.reviewedAt} is not null and ${table.publishedAt} is not null and ${table.canonicalPath} is not null)`,
    ),
  ],
);

export const skillVersionPublicationRecords = contentPublicationRecords;
export const learningPathVersionPublicationRecords = contentPublicationRecords;

// These imports make the intended publication coverage explicit to the type system and Drizzle schema.
void skillVersions;
void learningPathVersions;
