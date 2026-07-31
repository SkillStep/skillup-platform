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

import { users } from "./schema.js";

export const commercialPlans = pgTable(
  "commercial_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: text("status").$type<"draft" | "active" | "retired">().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("commercial_plans_code_unique").on(table.code),
    check("commercial_plans_code_format", sql`${table.code} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  ],
);

export const commercialPlanVersions = pgTable(
  "commercial_plan_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => commercialPlans.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    currency: text("currency").$type<"PKR">().notNull().default("PKR"),
    amountMinor: integer("amount_minor").notNull(),
    billingPeriod: text("billing_period").$type<"month" | "year">().notNull(),
    status: text("status").$type<"draft" | "active" | "retired">().notNull().default("draft"),
    capabilities: jsonb("capabilities").$type<readonly string[]>().notNull().default([]),
    termsVersion: text("terms_version").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("commercial_plan_versions_identity_unique").on(table.planId, table.version),
    check("commercial_plan_versions_positive", sql`${table.version} > 0`),
    check("commercial_plan_versions_amount", sql`${table.amountMinor} > 0`),
  ],
);

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planVersionId: uuid("plan_version_id")
      .notNull()
      .references(() => commercialPlanVersions.id, { onDelete: "restrict" }),
    provider: text("provider").$type<"jazzcash" | "sandbox">().notNull(),
    status: text("status")
      .$type<
        "created" | "pending" | "succeeded" | "failed" | "cancelled" | "expired" | "refunded"
      >()
      .notNull()
      .default("created"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").$type<"PKR">().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    merchantReference: text("merchant_reference").notNull(),
    providerReference: text("provider_reference"),
    checkoutExpiresAt: timestamp("checkout_expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_orders_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    uniqueIndex("payment_orders_merchant_reference_unique").on(table.merchantReference),
    index("payment_orders_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => paymentOrders.id, { onDelete: "restrict" }),
    provider: text("provider").$type<"jazzcash" | "sandbox">().notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type")
      .$type<"checkout_return" | "ipn" | "status_query" | "refund" | "manual_reconciliation">()
      .notNull(),
    providerStatus: text("provider_status").notNull(),
    signatureVerified: boolean("signature_verified").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_events_provider_event_unique").on(table.provider, table.providerEventId),
    index("payment_events_order_idx").on(table.orderId, table.receivedAt),
  ],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planVersionId: uuid("plan_version_id")
      .notNull()
      .references(() => commercialPlanVersions.id, { onDelete: "restrict" }),
    sourceOrderId: uuid("source_order_id").references(() => paymentOrders.id, {
      onDelete: "restrict",
    }),
    status: text("status")
      .$type<"active" | "grace" | "expired" | "cancelled" | "refunded" | "revoked">()
      .notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("entitlements_source_order_unique").on(table.sourceOrderId),
    index("entitlements_user_status_idx").on(table.userId, table.status, table.endsAt),
    check("entitlements_range", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const entitlementEvents = pgTable(
  "entitlement_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entitlementId: uuid("entitlement_id")
      .notNull()
      .references(() => entitlements.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    actorType: text("actor_type").$type<"system" | "admin">().notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    evidenceReference: text("evidence_reference"),
    previousStatus: text("previous_status"),
    nextStatus: text("next_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("entitlement_events_entitlement_idx").on(table.entitlementId, table.createdAt)],
);

export const reconciliationCases = pgTable(
  "reconciliation_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => paymentOrders.id, { onDelete: "restrict" }),
    mismatchKind: text("mismatch_kind").notNull(),
    status: text("status").$type<"open" | "resolved" | "ignored">().notNull().default("open"),
    providerEvidence: jsonb("provider_evidence").$type<Record<string, unknown>>().notNull().default({}),
    internalEvidence: jsonb("internal_evidence").$type<Record<string, unknown>>().notNull().default({}),
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [index("reconciliation_cases_order_idx").on(table.orderId, table.status)],
);

export const adminPrincipals = pgTable("admin_principals", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<"active" | "suspended" | "revoked">().notNull().default("active"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
});

export const adminRoleAssignments = pgTable(
  "admin_role_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => adminPrincipals.userId, { onDelete: "cascade" }),
    role: text("role")
      .$type<
        | "content_editor"
        | "content_reviewer"
        | "publisher"
        | "learner_support"
        | "payment_operator"
        | "analyst"
        | "security_admin"
      >()
      .notNull(),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("admin_role_assignments_user_idx").on(table.userId, table.role)],
);

export const privilegedAuditEvents = pgTable(
  "privileged_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    result: text("result").$type<"allowed" | "denied" | "succeeded" | "failed">().notNull(),
    reason: text("reason"),
    correlationId: text("correlation_id").notNull(),
    releaseSha: text("release_sha").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("privileged_audit_events_actor_idx").on(table.actorUserId, table.createdAt),
    index("privileged_audit_events_target_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
  ],
);

export const aiGenerationRequests = pgTable(
  "ai_generation_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "restrict" }),
    task: text("task").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    locale: text("locale").$type<"en" | "ur">().notNull().default("en"),
    promptVersion: text("prompt_version").notNull(),
    status: text("status")
      .$type<"queued" | "running" | "completed" | "failed" | "cancelled">()
      .notNull()
      .default("queued"),
    requestedItems: integer("requested_items").notNull().default(1),
    provider: text("provider"),
    model: text("model"),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ai_generation_requests_correlation_unique").on(table.correlationId),
    index("ai_generation_requests_status_idx").on(table.status, table.createdAt),
  ],
);

export const aiGeneratedArtifacts = pgTable(
  "ai_generated_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => aiGenerationRequests.id, { onDelete: "restrict" }),
    artifactType: text("artifact_type").notNull(),
    locale: text("locale").$type<"en" | "ur">().notNull(),
    contentDigest: text("content_digest").notNull(),
    originalContent: jsonb("original_content").$type<Record<string, unknown>>().notNull(),
    editedContent: jsonb("edited_content").$type<Record<string, unknown> | null>(),
    validationReport: jsonb("validation_report").$type<Record<string, unknown>>().notNull().default({}),
    qualityScore: integer("quality_score").notNull(),
    qualityThreshold: integer("quality_threshold").notNull(),
    status: text("status")
      .$type<"draft" | "held" | "in_review" | "approved" | "rejected" | "published" | "superseded">()
      .notNull()
      .default("draft"),
    sourceReferences: jsonb("source_references")
      .$type<readonly Record<string, unknown>[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_generated_artifacts_request_digest_unique").on(
      table.requestId,
      table.contentDigest,
    ),
    index("ai_generated_artifacts_review_queue_idx").on(
      table.status,
      table.qualityScore,
      table.createdAt,
    ),
  ],
);

export const aiArtifactReviews = pgTable(
  "ai_artifact_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => aiGeneratedArtifacts.id, { onDelete: "restrict" }),
    reviewerUserId: uuid("reviewer_user_id")
      .notNull()
      .references(() => adminPrincipals.userId, { onDelete: "restrict" }),
    decision: text("decision")
      .$type<"approve" | "reject" | "request_changes" | "escalate">()
      .notNull(),
    reason: text("reason").notNull(),
    editedContent: jsonb("edited_content").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ai_artifact_reviews_artifact_idx").on(table.artifactId, table.createdAt)],
);

export const aiArtifactPublications = pgTable("ai_artifact_publications", {
  id: uuid("id").defaultRandom().primaryKey(),
  artifactId: uuid("artifact_id")
    .notNull()
    .unique()
    .references(() => aiGeneratedArtifacts.id, { onDelete: "restrict" }),
  publishedTargetType: text("published_target_type").notNull(),
  publishedTargetVersionId: uuid("published_target_version_id").notNull(),
  publishedBy: uuid("published_by")
    .notNull()
    .references(() => adminPrincipals.userId, { onDelete: "restrict" }),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  rolledBackBy: uuid("rolled_back_by").references(() => adminPrincipals.userId, {
    onDelete: "restrict",
  }),
  rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  rollbackReason: text("rollback_reason"),
});

export const commercialEvents = pgTable(
  "commercial_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    eventName: text("event_name").notNull(),
    planCode: text("plan_code"),
    orderId: uuid("order_id").references(() => paymentOrders.id, { onDelete: "restrict" }),
    entitlementId: uuid("entitlement_id").references(() => entitlements.id, {
      onDelete: "restrict",
    }),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("commercial_events_name_time_idx").on(table.eventName, table.occurredAt)],
);
