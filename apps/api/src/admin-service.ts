import type { DatabaseClient } from "@skillup/database";

import { RequestAuthorizationError } from "./request-auth.js";

export type AdminRole =
  | "content_editor"
  | "content_reviewer"
  | "publisher"
  | "learner_support"
  | "payment_operator"
  | "analyst"
  | "security_admin";

export type AdminIdentity = Readonly<{
  userId: string;
  roles: readonly AdminRole[];
  capabilities: readonly string[];
}>;

export type GenerationRequestInput = Readonly<{
  task:
    | "generate_level"
    | "generate_distractors"
    | "generate_explanation"
    | "summarize_content"
    | "classify_difficulty"
    | "evaluate_content"
    | "translate_content";
  targetType: string;
  targetId?: string | null | undefined;
  locale: "en" | "ur";
  promptVersion: string;
  requestedItems: number;
}>;

export type ReviewArtifactInput = Readonly<{
  decision: "approve" | "reject" | "request_changes" | "escalate";
  reason: string;
  editedContent?: Readonly<Record<string, unknown>> | null | undefined;
}>;

export type PublishArtifactInput = Readonly<{
  targetType: string;
  targetVersionId: string;
  reason: string;
}>;

export type ResolveReconciliationInput = Readonly<{
  disposition: "resolved" | "ignored";
  resolution: string;
}>;

export type CorrectEntitlementInput = Readonly<{
  nextStatus: "active" | "grace" | "expired" | "cancelled" | "refunded" | "revoked";
  endsAt?: string | undefined;
  graceEndsAt?: string | null | undefined;
  reason: string;
  evidenceReference?: string | null | undefined;
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
    input: GenerationRequestInput,
    correlationId: string,
  ) => Promise<Readonly<{ id: string; status: string; correlationId: string }>>;
  listArtifacts: (
    status: string | undefined,
    limit: number,
  ) => Promise<readonly Record<string, unknown>[]>;
  reviewArtifact: (
    actor: AdminIdentity,
    artifactId: string,
    input: ReviewArtifactInput,
    correlationId: string,
  ) => Promise<Record<string, unknown>>;
  publishArtifact: (
    actor: AdminIdentity,
    artifactId: string,
    input: PublishArtifactInput,
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
    input: ResolveReconciliationInput,
    correlationId: string,
  ) => Promise<Record<string, unknown>>;
  correctEntitlement: (
    actor: AdminIdentity,
    entitlementId: string,
    input: CorrectEntitlementInput,
    correlationId: string,
  ) => Promise<Record<string, unknown>>;
  supportLearner: (userId: string) => Promise<Record<string, unknown>>;
  metrics: () => Promise<Record<string, unknown>>;
}>;

const roleCapabilities: Readonly<Record<AdminRole, readonly string[]>> = {
  content_editor: ["ai.request", "content.edit"],
  content_reviewer: ["ai.review", "content.compare"],
  publisher: ["ai.publish", "content.publish", "content.rollback"],
  learner_support: ["learner.support.read"],
  payment_operator: ["payment.read", "payment.reconcile", "entitlement.correct"],
  analyst: ["metrics.read"],
  security_admin: ["admin.roles", "audit.read"],
};

function isAdminRole(value: string): value is AdminRole {
  return Object.hasOwn(roleCapabilities, value);
}

function capabilitiesFor(roles: readonly AdminRole[]): readonly string[] {
  return [...new Set(roles.flatMap((role) => roleCapabilities[role]))].sort();
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
      const result = await options.pool.query<{ role: string }>(
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
      const roles = result.rows.map((row) => row.role).filter(isAdminRole);
      return roles.length === 0 ? null : { userId, roles, capabilities: capabilitiesFor(roles) };
    },

    audit,

    createGenerationRequest: async (actor, input, correlationId) => {
      const result = await options.pool.query<{
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
      const row = result.rows[0];
      if (!row) throw new Error("The AI generation request could not be created.");
      await audit({
        actorUserId: actor.userId,
        actorRole: actor.roles[0] ?? null,
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
        const selected = await connection.query<Record<string, unknown>>(
          `select id, status, quality_score, quality_threshold, validation_report
             from ai_generated_artifacts
            where id = $1
            for update`,
          [artifactId],
        );
        const artifact = selected.rows[0];
        if (!artifact) throw new RequestAuthorizationError(404, "The AI artifact was not found.");
        if (
          artifact["status"] !== "approved" ||
          Number(artifact["quality_score"]) < Number(artifact["quality_threshold"]) ||
          !validationAllowsApproval(artifact["validation_report"])
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
        const result = await connection.query<Record<string, unknown>>(
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
        const row = result.rows[0];
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
      const result = await options.pool.query<Record<string, unknown>>(
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
      const row = result.rows[0];
      if (!row) {
        throw new RequestAuthorizationError(404, "An open reconciliation case was not found.");
      }
      await audit({
        actorUserId: actor.userId,
        actorRole: actor.roles[0] ?? null,
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
           coalesce((
             select sum(pl.points_delta)
               from points_ledger pl
              where pl.user_id = u.id
           ), 0)::integer as "pointsEarned",
           (
             select count(*)::integer
               from level_play_sessions ls
              where ls.user_id = u.id
           ) as "gameplaySessions"
         from users u
         join learner_profiles p on p.user_id = u.id
         where u.id = $1`,
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
           (select count(*)::integer from level_play_sessions where state = 'completed') as "completedSessions",
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
