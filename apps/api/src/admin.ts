import { randomUUID } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AuthService, AuthenticatedLearner } from "./auth.js";
import type { ApiConfig } from "./config.js";
import {
  RequestAuthorizationError,
  requireAuthenticatedLearner,
  requireTrustedRequestOrigin,
} from "./request-auth.js";

const AdminRoleSchema = z.enum([
  "content_editor",
  "content_reviewer",
  "publisher",
  "learner_support",
  "payment_operator",
  "analyst",
  "security_admin",
]);
type AdminRole = z.infer<typeof AdminRoleSchema>;

const GenerateRequestSchema = z
  .object({
    task: z.enum([
      "generate_level",
      "generate_distractors",
      "generate_explanation",
      "summarize_content",
      "classify_difficulty",
      "evaluate_content",
      "translate_content",
    ]),
    targetType: z.string().trim().min(2).max(80),
    targetId: z.string().trim().min(1).max(200).nullable().optional(),
    locale: z.enum(["en", "ur"]).default("en"),
    promptVersion: z.string().trim().min(1).max(80),
    requestedItems: z.number().int().min(1).max(100).default(1),
  })
  .strict();

const ReviewArtifactSchema = z
  .object({
    decision: z.enum(["approve", "reject", "request_changes", "escalate"]),
    reason: z.string().trim().min(3).max(1_000),
    editedContent: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

const PublishArtifactSchema = z
  .object({
    targetType: z.string().trim().min(2).max(80),
    targetVersionId: z.string().uuid(),
    reason: z.string().trim().min(3).max(1_000),
  })
  .strict();

const RollbackArtifactSchema = z
  .object({
    reason: z.string().trim().min(3).max(1_000),
  })
  .strict();

const ResolveReconciliationSchema = z
  .object({
    disposition: z.enum(["resolved", "ignored"]),
    resolution: z.string().trim().min(3).max(1_000),
  })
  .strict();

const CorrectEntitlementSchema = z
  .object({
    nextStatus: z.enum(["active", "grace", "expired", "cancelled", "refunded", "revoked"]),
    endsAt: z.string().datetime().optional(),
    graceEndsAt: z.string().datetime().nullable().optional(),
    reason: z.string().trim().min(3).max(500),
    evidenceReference: z.string().trim().min(3).max(500).nullable().optional(),
  })
  .strict();

const ArtifactQuerySchema = z.object({
  status: z
    .enum(["draft", "held", "in_review", "approved", "rejected", "published", "superseded"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const ReconciliationQuerySchema = z.object({
  status: z.enum(["open", "resolved", "ignored"]).default("open"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const IdParamsSchema = z.object({ id: z.string().uuid() });
const LearnerParamsSchema = z.object({ userId: z.string().uuid() });

const roleCapabilities: Readonly<Record<AdminRole, readonly string[]>> = {
  content_editor: ["ai.request", "content.edit"],
  content_reviewer: ["ai.review", "content.compare"],
  publisher: ["ai.publish", "content.publish", "content.rollback"],
  learner_support: ["learner.support.read"],
  payment_operator: ["payment.read", "payment.reconcile", "entitlement.correct"],
  analyst: ["metrics.read"],
  security_admin: ["admin.roles", "audit.read"],
};

export type AdminIdentity = Readonly<{
  userId: string;
  roles: readonly AdminRole[];
  capabilities: readonly string[];
}>;

export type AdminService = Readonly<{
  resolveIdentity: (userId: string) => Promise<AdminIdentity | null>;
  audit: (input: {
    actorUserId: string | null;
    actorRole?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    result: "allowed" | "denied" | "succeeded" | "failed";
    reason?: string | null;
    correlationId: string;
    metadata?: Readonly<Record<string, unknown>>;
  }) => Promise<void>;
  createGenerationRequest: (
    actor: AdminIdentity,
    input: z.infer<typeof GenerateRequestSchema>,
    correlationId: string,
  ) => Promise<Readonly<{ id: string; status: string; correlationId: string }>>;
  listArtifacts: (
    status: string | undefined,
    limit: number,
  ) => Promise<readonly Record<string, unknown>[]>;
  reviewArtifact: (
    actor: AdminIdentity,
    artifactId: string,
    input: z.infer<typeof ReviewArtifactSchema>,
    correlationId: string,
  ) => Promise<Record<string, unknown>>;
  publishArtifact: (
    actor: AdminIdentity,
    artifactId: string,
    input: z.infer<typeof PublishArtifactSchema>,
    correlationId: string,
  ) => Promise<Record<string, unknown>>;
  rollbackArtifact: (
    actor: AdminIdentity,
    artifactId: string,
    reason: string,
    correlationId: string,
  ) => Promise<Record<string, unknown>>;
  listReconciliation: (
    status: "open" | "resolved" | "ignored",
    limit: number,
  ) => Promise<readonly Record<string, unknown>[]>;
  resolveReconciliation: (
    actor: AdminIdentity,
    caseId: string,
    input: z.infer<typeof ResolveReconciliationSchema>,
    correlationId: string,
  ) => Promise<Record<string, unknown>>;
  correctEntitlement: (
    actor: AdminIdentity,
    entitlementId: string,
    input: z.infer<typeof CorrectEntitlementSchema>,
    correlationId: string,
  ) => Promise<Record<string, unknown>>;
  supportLearner: (userId: string) => Promise<Record<string, unknown>>;
  metrics: () => Promise<Record<string, unknown>>;
}>;

function capabilitiesFor(roles: readonly AdminRole[]): readonly string[] {
  return [...new Set(roles.flatMap((role) => roleCapabilities[role]))].sort();
}

function hasCapability(identity: AdminIdentity, capability: string): boolean {
  return identity.capabilities.includes(capability);
}

function validationAllowsApproval(report: unknown): boolean {
  if (!report || typeof report !== "object" || Array.isArray(report)) return false;
  const record = report as Record<string, unknown>;
  return (
    record["schema"] === true &&
    record["answerConsistency"] === true &&
    record["duplicate"] === false &&
    record["prohibitedContent"] !== true &&
    record["unsupportedClaim"] !== true
  );
}

export function createAdminService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    releaseSha: string;
    now?: () => Date;
  }>,
): AdminService {
  const now = options.now ?? (() => new Date());

  const audit: AdminService["audit"] = async (input) => {
    await options.pool.query(
      `insert into privileged_audit_events (
         actor_user_id,
         actor_role,
         action,
         target_type,
         target_id,
         result,
         reason,
         correlation_id,
         release_sha,
         metadata
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        input.actorUserId,
        input.actorRole ?? null,
        input.action,
        input.targetType,
        input.targetId,
        input.result,
        input.reason ?? null,
        input.correlationId,
        options.releaseSha,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  };

  return {
    resolveIdentity: async (userId) => {
      const result = await options.pool.query<{ role: AdminRole }>(
        `select r.role
           from admin_principals p
           join admin_role_assignments r on r.user_id = p.user_id
          where p.user_id = $1
            and p.status = 'active'
            and r.revoked_at is null
            and (r.expires_at is null or r.expires_at > $2)
          order by r.role`,
        [userId, now()],
      );
      const roles = result.rows.map((row) => AdminRoleSchema.parse(row.role));
      return roles.length === 0 ? null : { userId, roles, capabilities: capabilitiesFor(roles) };
    },

    audit,

    createGenerationRequest: async (actor, input, correlationId) => {
      const created = await options.pool.query<{
        id: string;
        status: string;
        correlation_id: string;
      }>(
        `insert into ai_generation_requests (
           requested_by,
           task,
           target_type,
           target_id,
           locale,
           prompt_version,
           status,
           requested_items,
           correlation_id
         )
         values ($1, $2, $3, $4, $5, $6, 'queued', $7, $8)
         returning id, status, correlation_id`,
        [
          actor.userId,
          input.task,
          input.targetType,
          input.targetId ?? null,
          input.locale,
          input.promptVersion,
          input.requestedItems,
          correlationId,
        ],
      );
      const row = created.rows[0];
      if (!row) throw new Error("The AI generation request could not be created.");
      await audit({
        actorUserId: actor.userId,
        actorRole: actor.roles[0],
        action: "ai.generation.request",
        targetType: "ai_generation_request",
        targetId: row.id,
        result: "succeeded",
        reason: "Bounded generation request created",
        correlationId,
        metadata: {
          task: input.task,
          requestedItems: input.requestedItems,
          promptVersion: input.promptVersion,
        },
      });
      return { id: row.id, status: row.status, correlationId: row.correlation_id };
    },

    listArtifacts: async (status, limit) => {
      const result = await options.pool.query<Record<string, unknown>>(
        `select
           a.id,
           a.artifact_type as "artifactType",
           a.locale,
           a.quality_score as "qualityScore",
           a.quality_threshold as "qualityThreshold",
           a.status,
           a.validation_report as "validationReport",
           a.source_references as "sourceReferences",
           a.original_content as "originalContent",
           a.edited_content as "editedContent",
           a.created_at as "createdAt",
           r.task,
           r.prompt_version as "promptVersion",
           r.provider,
           r.model,
           r.correlation_id as "correlationId"
         from ai_generated_artifacts a
         join ai_generation_requests r on r.id = a.request_id
         where ($1::text is null or a.status = $1)
         order by
           case when a.status in ('held', 'in_review') then 0 else 1 end,
           a.created_at
         limit $2`,
        [status ?? null, limit],
      );
      return result.rows;
    },

    reviewArtifact: async (actor, artifactId, input, correlationId) => {
      const connection = await options.pool.connect();
      try {
        await connection.query("begin");
        const selected = await connection.query<Record<string, unknown>>(
          `select id, status, quality_score, quality_threshold, validation_report
             from ai_generated_artifacts
            where id = $1
            for update`,
          [artifactId],
        );
        const artifact = selected.rows[0];
        if (!artifact) throw new RequestAuthorizationError(404, "The AI artifact was not found.");
        if (["published", "superseded"].includes(String(artifact["status"]))) {
          throw new RequestAuthorizationError(
            409,
            "Published artifact history cannot be reviewed in place.",
          );
        }

        if (
          input.decision === "approve" &&
          (Number(artifact["quality_score"]) < Number(artifact["quality_threshold"]) ||
            !validationAllowsApproval(artifact["validation_report"]))
        ) {
          throw new RequestAuthorizationError(
            409,
            "The artifact has not passed its approved quality and validation policy.",
          );
        }

        const nextStatus =
          input.decision === "approve"
            ? "approved"
            : input.decision === "reject"
              ? "rejected"
              : input.decision === "request_changes"
                ? "in_review"
                : "held";
        await connection.query(
          `insert into ai_artifact_reviews (
             artifact_id,
             reviewer_user_id,
             decision,
             reason,
             edited_content
           )
           values ($1, $2, $3, $4, $5::jsonb)`,
          [
            artifactId,
            actor.userId,
            input.decision,
            input.reason,
            input.editedContent ? JSON.stringify(input.editedContent) : null,
          ],
        );
        const updated = await connection.query<Record<string, unknown>>(
          `update ai_generated_artifacts
              set status = $2,
                  edited_content = coalesce($3::jsonb, edited_content),
                  updated_at = $4
            where id = $1
            returning id, status, quality_score as "qualityScore",
                      quality_threshold as "qualityThreshold", updated_at as "updatedAt"`,
          [
            artifactId,
            nextStatus,
            input.editedContent ? JSON.stringify(input.editedContent) : null,
            now(),
          ],
        );
        await connection.query(
          `insert into privileged_audit_events (
             actor_user_id, actor_role, action, target_type, target_id, result,
             reason, correlation_id, release_sha, metadata
           )
           values ($1, $2, 'ai.artifact.review', 'ai_generated_artifact', $3, 'succeeded',
                   $4, $5, $6, jsonb_build_object('decision', $7::text))`,
          [
            actor.userId,
            actor.roles[0] ?? null,
            artifactId,
            input.reason,
            correlationId,
            options.releaseSha,
            input.decision,
          ],
        );
        await connection.query("commit");
        const row = updated.rows[0];
        if (!row) throw new Error("The reviewed artifact could not be loaded.");
        return row;
      } catch (error) {
        await connection.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    },

    publishArtifact: async (actor, artifactId, input, correlationId) => {
      const connection = await options.pool.connect();
      try {
        await connection.query("begin");
        const artifact = await connection.query<Record<string, unknown>>(
          `select id, status, quality_score, quality_threshold, validation_report
             from ai_generated_artifacts
            where id = $1
            for update`,
          [artifactId],
        );
        const current = artifact.rows[0];
        if (!current) throw new RequestAuthorizationError(404, "The AI artifact was not found.");
        if (
          current["status"] !== "approved" ||
          Number(current["quality_score"]) < Number(current["quality_threshold"]) ||
          !validationAllowsApproval(current["validation_report"])
        ) {
          throw new RequestAuthorizationError(
            409,
            "Only a human-approved artifact that still passes policy can be published.",
          );
        }

        const publication = await connection.query<Record<string, unknown>>(
          `insert into ai_artifact_publications (
             artifact_id,
             published_target_type,
             published_target_version_id,
             published_by
           )
           values ($1, $2, $3, $4)
           returning id, artifact_id as "artifactId",
                     published_target_type as "targetType",
                     published_target_version_id as "targetVersionId",
                     published_at as "publishedAt"`,
          [artifactId, input.targetType, input.targetVersionId, actor.userId],
        );
        await connection.query(
          "update ai_generated_artifacts set status = 'published', updated_at = $2 where id = $1",
          [artifactId, now()],
        );
        await connection.query(
          `insert into privileged_audit_events (
             actor_user_id, actor_role, action, target_type, target_id, result,
             reason, correlation_id, release_sha, metadata
           )
           values ($1, $2, 'ai.artifact.publish', 'ai_generated_artifact', $3, 'succeeded',
                   $4, $5, $6, jsonb_build_object('targetType', $7::text, 'targetVersionId', $8::text))`,
          [
            actor.userId,
            actor.roles[0] ?? null,
            artifactId,
            input.reason,
            correlationId,
            options.releaseSha,
            input.targetType,
            input.targetVersionId,
          ],
        );
        await connection.query("commit");
        const row = publication.rows[0];
        if (!row) throw new Error("The publication record could not be loaded.");
        return row;
      } catch (error) {
        await connection.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    },

    rollbackArtifact: async (actor, artifactId, reason, correlationId) => {
      const connection = await options.pool.connect();
      try {
        await connection.query("begin");
        const rolledBack = await connection.query<Record<string, unknown>>(
          `update ai_artifact_publications
              set rolled_back_by = $2,
                  rolled_back_at = $3,
                  rollback_reason = $4
            where artifact_id = $1
              and rolled_back_at is null
            returning id, artifact_id as "artifactId",
                      published_target_type as "targetType",
                      published_target_version_id as "targetVersionId",
                      rolled_back_at as "rolledBackAt"`,
          [artifactId, actor.userId, now(), reason],
        );
        const row = rolledBack.rows[0];
        if (!row) {
          throw new RequestAuthorizationError(404, "An active publication was not found.");
        }
        await connection.query(
          "update ai_generated_artifacts set status = 'superseded', updated_at = $2 where id = $1",
          [artifactId, now()],
        );
        await connection.query(
          `insert into privileged_audit_events (
             actor_user_id, actor_role, action, target_type, target_id, result,
             reason, correlation_id, release_sha, metadata
           )
           values ($1, $2, 'ai.artifact.rollback', 'ai_generated_artifact', $3, 'succeeded',
                   $4, $5, $6, '{}'::jsonb)`,
          [
            actor.userId,
            actor.roles[0] ?? null,
            artifactId,
            reason,
            correlationId,
            options.releaseSha,
          ],
        );
        await connection.query("commit");
        return row;
      } catch (error) {
        await connection.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    },

    listReconciliation: async (status, limit) => {
      const result = await options.pool.query<Record<string, unknown>>(
        `select
           c.id,
           c.status,
           c.mismatch_kind as "mismatchKind",
           c.provider_evidence as "providerEvidence",
           c.internal_evidence as "internalEvidence",
           c.resolution,
           c.created_at as "createdAt",
           c.resolved_at as "resolvedAt",
           o.id as "orderId",
           o.merchant_reference as "merchantReference",
           o.provider_reference as "providerReference",
           o.status as "orderStatus",
           o.amount_minor as "amountMinor",
           o.currency
         from reconciliation_cases c
         join payment_orders o on o.id = c.order_id
         where c.status = $1
         order by c.created_at
         limit $2`,
        [status, limit],
      );
      return result.rows;
    },

    resolveReconciliation: async (actor, caseId, input, correlationId) => {
      const resolved = await options.pool.query<Record<string, unknown>>(
        `update reconciliation_cases
            set status = $2,
                resolution = $3,
                resolved_by = $4,
                resolved_at = $5
          where id = $1 and status = 'open'
          returning id, status, mismatch_kind as "mismatchKind",
                    resolution, resolved_at as "resolvedAt"`,
        [caseId, input.disposition, input.resolution, actor.userId, now()],
      );
      const row = resolved.rows[0];
      if (!row)
        throw new RequestAuthorizationError(404, "An open reconciliation case was not found.");
      await audit({
        actorUserId: actor.userId,
        actorRole: actor.roles[0],
        action: "payment.reconciliation.resolve",
        targetType: "reconciliation_case",
        targetId: caseId,
        result: "succeeded",
        reason: input.resolution,
        correlationId,
        metadata: { disposition: input.disposition },
      });
      return row;
    },

    correctEntitlement: async (actor, entitlementId, input, correlationId) => {
      const connection = await options.pool.connect();
      try {
        await connection.query("begin");
        const current = await connection.query<{
          status: string;
          ends_at: Date;
          grace_ends_at: Date | null;
        }>(
          `select status, ends_at, grace_ends_at
             from entitlements
            where id = $1
            for update`,
          [entitlementId],
        );
        const previous = current.rows[0];
        if (!previous) throw new RequestAuthorizationError(404, "The entitlement was not found.");

        const endsAt = input.endsAt ? new Date(input.endsAt) : previous.ends_at;
        const graceEndsAt =
          input.graceEndsAt === undefined
            ? previous.grace_ends_at
            : input.graceEndsAt === null
              ? null
              : new Date(input.graceEndsAt);
        if (graceEndsAt && graceEndsAt < endsAt) {
          throw new RequestAuthorizationError(
            400,
            "Grace expiry cannot precede entitlement expiry.",
          );
        }

        const updated = await connection.query<Record<string, unknown>>(
          `update entitlements
              set status = $2,
                  ends_at = $3,
                  grace_ends_at = $4,
                  cancelled_at = case when $2 = 'cancelled' then $5 else cancelled_at end,
                  revoked_at = case when $2 = 'revoked' then $5 else revoked_at end,
                  updated_at = $5
            where id = $1
            returning id, user_id as "userId", status,
                      starts_at as "startsAt", ends_at as "endsAt",
                      grace_ends_at as "graceEndsAt"`,
          [entitlementId, input.nextStatus, endsAt, graceEndsAt, now()],
        );
        await connection.query(
          `insert into entitlement_events (
             entitlement_id,
             action,
             actor_type,
             actor_user_id,
             reason,
             evidence_reference,
             previous_status,
             next_status
           )
           values ($1, 'correct', 'admin', $2, $3, $4, $5, $6)`,
          [
            entitlementId,
            actor.userId,
            input.reason,
            input.evidenceReference ?? null,
            previous.status,
            input.nextStatus,
          ],
        );
        await connection.query(
          `insert into privileged_audit_events (
             actor_user_id, actor_role, action, target_type, target_id, result,
             reason, correlation_id, release_sha, metadata
           )
           values ($1, $2, 'entitlement.correct', 'entitlement', $3, 'succeeded',
                   $4, $5, $6, jsonb_build_object('previousStatus', $7::text, 'nextStatus', $8::text))`,
          [
            actor.userId,
            actor.roles[0] ?? null,
            entitlementId,
            input.reason,
            correlationId,
            options.releaseSha,
            previous.status,
            input.nextStatus,
          ],
        );
        await connection.query("commit");
        const row = updated.rows[0];
        if (!row) throw new Error("The corrected entitlement could not be loaded.");
        return row;
      } catch (error) {
        await connection.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    },

    supportLearner: async (userId) => {
      const learner = await options.pool.query<Record<string, unknown>>(
        `select
           u.id,
           u.status,
           p.locale,
           p.age_band as "ageBand",
           p.onboarding_status as "onboardingStatus",
           p.created_at as "createdAt",
           coalesce(sum(case when pe.delta > 0 then pe.delta else 0 end), 0)::integer as "pointsEarned",
           count(distinct gs.id)::integer as "gameplaySessions"
         from users u
         join learner_profiles p on p.user_id = u.id
         left join point_events pe on pe.user_id = u.id
         left join gameplay_sessions gs on gs.user_id = u.id
         where u.id = $1
         group by u.id, u.status, p.locale, p.age_band, p.onboarding_status, p.created_at`,
        [userId],
      );
      const row = learner.rows[0];
      if (!row) throw new RequestAuthorizationError(404, "The learner was not found.");

      const commercial = await options.pool.query<Record<string, unknown>>(
        `select
           e.id as "entitlementId",
           e.status as "entitlementStatus",
           e.ends_at as "entitlementEndsAt",
           o.merchant_reference as "merchantReference",
           o.provider_reference as "providerReference",
           o.status as "paymentStatus"
         from entitlements e
         left join payment_orders o on o.id = e.source_order_id
         where e.user_id = $1
         order by e.created_at desc
         limit 5`,
        [userId],
      );
      return { learner: row, commercial: commercial.rows };
    },

    metrics: async () => {
      const result = await options.pool.query<Record<string, unknown>>(
        `select
           (select count(*)::integer from users where status = 'active') as "activeLearners",
           (select count(*)::integer from gameplay_sessions where status = 'completed') as "completedSessions",
           (select count(*)::integer from payment_orders where status = 'succeeded') as "successfulPayments",
           (select coalesce(sum(amount_minor), 0)::bigint from payment_orders where status = 'succeeded') as "grossRevenueMinor",
           (select count(*)::integer from entitlements where status in ('active', 'grace')) as "activeEntitlements",
           (select count(*)::integer from reconciliation_cases where status = 'open') as "openReconciliationCases",
           (select count(*)::integer from ai_generated_artifacts where status in ('held', 'in_review')) as "aiReviewBacklog",
           (select count(*)::integer from ai_generated_artifacts where status = 'published') as "publishedAiArtifacts",
           (select max(occurred_at) from commercial_events) as "commercialDataFreshness"`,
      );
      return result.rows[0] ?? {};
    },
  };
}

async function requireAdmin(
  request: FastifyRequest,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    adminService: AdminService;
  }>,
  capability: string,
): Promise<Readonly<{ learner: AuthenticatedLearner; admin: AdminIdentity }>> {
  const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
  const admin = await options.adminService.resolveIdentity(learner.id);
  if (!admin || !hasCapability(admin, capability)) {
    await options.adminService.audit({
      actorUserId: learner.id,
      action: capability,
      targetType: "admin_route",
      targetId: request.routeOptions.url ?? request.url,
      result: "denied",
      reason: "Missing administrative capability",
      correlationId: request.id,
    });
    throw new RequestAuthorizationError(403, "Administrative access is not allowed.");
  }
  return { learner, admin };
}

export function registerAdminRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    adminService: AdminService;
  }>,
): void {
  app.get("/v1/admin/session", async (request) => {
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const admin = await options.adminService.resolveIdentity(learner.id);
    if (!admin) throw new RequestAuthorizationError(403, "Administrative access is not allowed.");
    return { admin };
  });

  app.post("/v1/admin/ai/requests", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "ai.request");
    const body = GenerateRequestSchema.parse(request.body);
    return reply
      .status(202)
      .send(await options.adminService.createGenerationRequest(admin, body, request.id));
  });

  app.get("/v1/admin/ai/artifacts", async (request) => {
    await requireAdmin(request, options, "ai.review");
    const query = ArtifactQuerySchema.parse(request.query);
    return {
      artifacts: await options.adminService.listArtifacts(query.status, query.limit),
    };
  });

  app.post("/v1/admin/ai/artifacts/:id/reviews", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "ai.review");
    const { id } = IdParamsSchema.parse(request.params);
    const body = ReviewArtifactSchema.parse(request.body);
    return {
      artifact: await options.adminService.reviewArtifact(admin, id, body, request.id),
    };
  });

  app.post("/v1/admin/ai/artifacts/:id/publish", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "ai.publish");
    const { id } = IdParamsSchema.parse(request.params);
    const body = PublishArtifactSchema.parse(request.body);
    return {
      publication: await options.adminService.publishArtifact(admin, id, body, request.id),
    };
  });

  app.post("/v1/admin/ai/artifacts/:id/rollback", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "content.rollback");
    const { id } = IdParamsSchema.parse(request.params);
    const body = RollbackArtifactSchema.parse(request.body);
    return {
      publication: await options.adminService.rollbackArtifact(admin, id, body.reason, request.id),
    };
  });

  app.get("/v1/admin/reconciliation", async (request) => {
    await requireAdmin(request, options, "payment.read");
    const query = ReconciliationQuerySchema.parse(request.query);
    return {
      cases: await options.adminService.listReconciliation(query.status, query.limit),
    };
  });

  app.post("/v1/admin/reconciliation/:id/resolve", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "payment.reconcile");
    const { id } = IdParamsSchema.parse(request.params);
    const body = ResolveReconciliationSchema.parse(request.body);
    return {
      case: await options.adminService.resolveReconciliation(admin, id, body, request.id),
    };
  });

  app.post("/v1/admin/entitlements/:id/correct", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "entitlement.correct");
    const { id } = IdParamsSchema.parse(request.params);
    const body = CorrectEntitlementSchema.parse(request.body);
    return {
      entitlement: await options.adminService.correctEntitlement(admin, id, body, request.id),
    };
  });

  app.get("/v1/admin/learners/:userId/support", async (request) => {
    await requireAdmin(request, options, "learner.support.read");
    const { userId } = LearnerParamsSchema.parse(request.params);
    return options.adminService.supportLearner(userId);
  });

  app.get("/v1/admin/metrics", async (request) => {
    await requireAdmin(request, options, "metrics.read");
    return { metrics: await options.adminService.metrics() };
  });
}
