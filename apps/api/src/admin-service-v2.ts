import type { DatabaseClient } from "@skillup/database";

import {
  type AdminIdentity,
  type AdminRole,
  type AdminService as BaseAdminService,
  type CorrectEntitlementInput,
  type PublishArtifactInput,
  type ResolveReconciliationInput,
  type ReviewArtifactInput,
  createAdminService as createBaseAdminService,
} from "./admin-service.js";

export type {
  AdminIdentity,
  AdminRole,
  CorrectEntitlementInput,
  PublishArtifactInput,
  ResolveReconciliationInput,
  ReviewArtifactInput,
};

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
  inputPayload: Readonly<Record<string, unknown>>;
}>;

export type GenerationRequestStatus = Readonly<{
  id: string;
  status: string;
  provider: string | null;
  model: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}>;

export type AdminService = Omit<BaseAdminService, "createGenerationRequest"> &
  Readonly<{
    createGenerationRequest: (
      actor: AdminIdentity,
      input: GenerationRequestInput,
      correlationId: string,
    ) => Promise<Readonly<{ id: string; status: string; correlationId: string }>>;
    getGenerationRequest: (requestId: string) => Promise<GenerationRequestStatus>;
    cancelGenerationRequest: (
      actor: AdminIdentity,
      requestId: string,
      reason: string,
      correlationId: string,
    ) => Promise<
      Readonly<{ id: string; status: "running" | "cancelled"; cancellationRequested: true }>
    >;
  }>;

export function createAdminService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    releaseSha: string;
    now?: () => Date;
  }>,
): AdminService {
  const base = createBaseAdminService(options);
  const now = options.now ?? (() => new Date());

  return {
    ...base,
    metrics: async () => {
      const [baseMetrics, expanded] = await Promise.all([
        base.metrics(),
        options.pool.query<Record<string, unknown>>(
          `select
             (select count(*)::integer from analytics_events) as "analyticsEvents",
             (select count(*)::integer from analytics_events where authority = 'client') as "clientAnalyticsEvents",
             (select count(*)::integer from analytics_events where authority = 'server') as "serverAnalyticsEvents",
             (select count(*)::integer from analytics_events where event_name = 'registration_started') as "registrationStarts",
             (select count(*)::integer from analytics_events where event_name = 'registration_completed') as "registrationsCompleted",
             (select count(*)::integer from analytics_events where event_name = 'onboarding_completed') as "onboardingCompletions",
             (select count(*)::integer from analytics_events where event_name = 'level_started') as "levelStarts",
             (select count(*)::integer from analytics_events where event_name = 'level_completed') as "levelCompletions",
             (select count(*)::integer from analytics_events where event_name = 'path_completed') as "pathCompletions",
             (select count(*)::integer from analytics_events where event_name = 'pricing_viewed') as "pricingViews",
             (select count(*)::integer from analytics_events where event_name = 'upgrade_started') as "upgradeStarts",
             (select count(*)::integer from analytics_events where event_name = 'payment_started') as "paymentStarts",
             (select count(*)::integer from analytics_events where event_name = 'payment_verified') as "verifiedPaymentEvents",
             (select count(*)::integer from analytics_events where event_name = 'premium_activated') as "premiumActivationEvents",
             (select count(*)::integer from analytics_events where event_name = 'first_premium_action') as "firstPremiumActions",
             (select count(*)::integer from analytics_consents where consent_state = 'product') as "productAnalyticsConsents",
             (select count(*)::integer from analytics_consents where consent_state = 'essential') as "essentialOnlyConsents",
             (select count(*)::integer from experiment_assignments where status = 'active') as "activeExperimentAssignments",
             (select count(*)::integer from public_content_entries where status = 'published') as "publishedPublicContentEntries",
             (select count(*)::integer from content_reports where status = 'open') as "openContentReports",
             (select count(*)::integer from ai_generation_requests where status = 'queued') as "queuedAiJobs",
             (select count(*)::integer from ai_generation_requests where status = 'running') as "runningAiJobs",
             (select count(*)::integer from ai_generation_requests where status = 'completed') as "completedAiJobs",
             (select count(*)::integer from ai_generation_requests where status = 'failed') as "failedAiJobs",
             (select count(*)::integer from ai_job_attempts where status = 'cancelled') as "cancelledAiAttempts",
             (select (coalesce(sum(estimated_cost_microusd), 0)::numeric / 1000000)::numeric(12,6)
                from ai_job_attempts
               where status = 'completed') as "estimatedAiCostUsd",
             (select count(*)::integer
                from analytics_events
               where received_at > occurred_at + interval '5 minutes') as "analyticsEventsDelayedOverFiveMinutes",
             (select max(received_at) from analytics_events) as "analyticsDataFreshness",
             (select max(updated_at) from public_content_entries where status = 'published') as "publicContentFreshness",
             (select max(completed_at) from ai_job_attempts) as "aiJobDataFreshness"`,
        ),
      ]);
      return { ...baseMetrics, ...(expanded.rows[0] ?? {}) };
    },

    createGenerationRequest: async (actor, input, correlationId) => {
      const encodedPayload = JSON.stringify(input.inputPayload);
      if (Buffer.byteLength(encodedPayload, "utf8") > 40_000) {
        throw Object.assign(new Error("AI generation input exceeds the 40 KB limit."), {
          statusCode: 400,
        });
      }
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
           correlation_id,
           input_payload,
           next_attempt_at
         )
         values ($1, $2, $3, $4, $5, $6, 'queued', $7, $8, $9::jsonb, now())
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
          encodedPayload,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("The AI generation request could not be created.");
      await base.audit({
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
          inputFields: Object.keys(input.inputPayload).sort(),
        },
      });
      return { id: row.id, status: row.status, correlationId: row.correlation_id };
    },

    getGenerationRequest: async (requestId) => {
      const result = await options.pool.query<GenerationRequestStatus>(
        `select
           id,
           status,
           provider,
           model,
           attempt_count as "attemptCount",
           last_error as "lastError",
           created_at as "createdAt",
           started_at as "startedAt",
           completed_at as "completedAt"
         from ai_generation_requests
         where id = $1`,
        [requestId],
      );
      const row = result.rows[0];
      if (!row) {
        throw Object.assign(new Error("The AI generation request was not found."), {
          statusCode: 404,
        });
      }
      return row;
    },

    cancelGenerationRequest: async (actor, requestId, reason, correlationId) => {
      const cancelledAt = now();
      const result = await options.pool.query<{ id: string; status: "running" | "cancelled" }>(
        `update ai_generation_requests
            set cancelled_at = $2,
                status = case when status = 'queued' then 'cancelled' else status end,
                completed_at = case when status = 'queued' then $2 else completed_at end,
                lease_token = case when status = 'queued' then null else lease_token end,
                lease_expires_at = case when status = 'queued' then null else lease_expires_at end,
                last_error = $3
          where id = $1
            and status in ('queued', 'running')
            and cancelled_at is null
          returning id, status`,
        [requestId, cancelledAt, `Cancellation requested: ${reason}`],
      );
      const row = result.rows[0];
      if (!row) {
        const existing = await options.pool.query<{ status: string }>(
          `select status from ai_generation_requests where id = $1`,
          [requestId],
        );
        if (!existing.rows[0]) {
          throw Object.assign(new Error("The AI generation request was not found."), {
            statusCode: 404,
          });
        }
        throw Object.assign(
          new Error(
            `The AI generation request cannot be cancelled from ${existing.rows[0].status}.`,
          ),
          { statusCode: 409 },
        );
      }

      await base.audit({
        actorUserId: actor.userId,
        actorRole: actor.roles[0] ?? null,
        action: "ai.generation.cancel",
        targetType: "ai_generation_request",
        targetId: requestId,
        result: "succeeded",
        reason,
        correlationId,
        metadata: { resultingStatus: row.status },
      });
      return { id: row.id, status: row.status, cancellationRequested: true };
    },
  };
}
