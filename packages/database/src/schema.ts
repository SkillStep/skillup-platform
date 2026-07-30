import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const contentStatuses = ["draft", "in_review", "published", "archived"] as const;
const locales = ["en", "ur"] as const;

export type ContentStatus = (typeof contentStatuses)[number];
export type ContentLocale = (typeof locales)[number];

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
    check("skills_status_allowed", sql`${table.status} in ('draft', 'in_review', 'published', 'archived')`),
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
    check("learning_path_versions_title_length", sql`char_length(${table.title}) between 3 and 120`),
    check(
      "learning_path_versions_summary_length",
      sql`char_length(${table.summary}) between 40 and 300`,
    ),
  ],
);
