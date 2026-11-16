import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { skillVersions, skills, users } from "./schema.js";

export const skillCompletionRequirementSets = pgTable(
  "skill_completion_requirement_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    skillVersionId: uuid("skill_version_id")
      .notNull()
      .references(() => skillVersions.id, { onDelete: "restrict" }),
    requirementVersion: integer("requirement_version").notNull(),
    levelVersionIds: uuid("level_version_ids").array().notNull(),
    challengeVersionIds: uuid("challenge_version_ids").array().notNull(),
    contentDigest: text("content_digest").notNull(),
    minimumPassPercent: integer("minimum_pass_percent"),
    requiredCapstone: boolean("required_capstone").notNull().default(true),
    retriesAllowed: boolean("retries_allowed"),
    status: text("status").notNull().default("draft"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalReason: text("approval_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("skill_completion_requirement_version_unique").on(
      table.skillId,
      table.requirementVersion,
    ),
    uniqueIndex("skill_completion_one_active_set").on(table.skillId).where(
      sql`${table.status} = 'active'`,
    ),
    index("skill_completion_requirements_version").on(table.skillVersionId, table.status),
    check("skill_completion_positive_version", sql`${table.requirementVersion} >= 1`),
    check("skill_completion_content_digest_format", sql`${table.contentDigest} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const skillCapstoneAttestations = pgTable(
  "skill_capstone_attestations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requirementSetId: uuid("requirement_set_id")
      .notNull()
      .references(() => skillCompletionRequirementSets.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewerUserId: uuid("reviewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decision: text("decision").notNull(),
    evidenceDigest: text("evidence_digest").notNull(),
    reason: text("reason").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("skill_capstone_evidence_unique").on(
      table.requirementSetId,
      table.userId,
      table.evidenceDigest,
    ),
    index("skill_capstone_by_user").on(table.userId, table.requirementSetId, table.verifiedAt),
    check("skill_capstone_distinct_reviewer", sql`${table.userId} <> ${table.reviewerUserId}`),
  ],
);

export const skillCertificateAwards = pgTable(
  "skill_certificate_awards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicId: text("public_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    requirementSetId: uuid("requirement_set_id")
      .notNull()
      .references(() => skillCompletionRequirementSets.id, { onDelete: "restrict" }),
    certificateTitle: text("certificate_title").notNull(),
    learnerName: text("learner_name").notNull(),
    evidenceDigest: text("evidence_digest").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "restrict" }),
    revocationReason: text("revocation_reason"),
  },
  (table) => [
    uniqueIndex("skill_certificate_awards_public_unique").on(table.publicId),
    uniqueIndex("skill_certificate_awards_learner_requirement_unique").on(
      table.userId,
      table.skillId,
      table.requirementSetId,
    ),
    index("skill_certificate_user_history").on(table.userId, table.issuedAt),
    check("skill_certificate_public_id_format", sql`${table.publicId} ~ '^SC-[A-Za-z0-9_-]{26,64}$'`),
  ],
);

export const skillCertificateEvents = pgTable(
  "skill_certificate_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    awardId: uuid("award_id")
      .notNull()
      .references(() => skillCertificateAwards.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    eventDigest: text("event_digest").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("skill_certificate_event_history").on(table.awardId, table.occurredAt, table.id),
  ],
);
