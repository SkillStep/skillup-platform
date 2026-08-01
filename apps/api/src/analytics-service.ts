import { createHash } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AuthService } from "./auth.js";
import type { ApiConfig } from "./config.js";

const EventNameSchema = z.enum([
  "public_page_viewed",
  "search_performed",
  "skill_viewed",
  "path_viewed",
  "guide_viewed",
  "question_viewed",
  "glossary_viewed",
  "comparison_viewed",
  "registration_started",
  "registration_completed",
  "onboarding_started",
  "onboarding_completed",
  "assessment_started",
  "assessment_completed",
  "level_started",
  "challenge_submitted",
  "challenge_retried",
  "level_completed",
  "path_completed",
  "achievement_unlocked",
  "achievement_shared",
  "leaderboard_opted_in",
  "pricing_viewed",
  "upgrade_started",
  "payment_started",
  "payment_pending",
  "payment_verified",
  "payment_failed",
  "premium_activated",
  "premium_expired",
  "refund_completed",
  "first_premium_action",
  "ai_generation_requested",
  "ai_generation_completed",
  "ai_generation_failed",
  "ai_artifact_reviewed",
  "ai_artifact_published",
  "support_requested",
  "content_reported",
  "account_export_requested",
  "account_deletion_requested",
  "reliability_error_observed",
]);

const ESSENTIAL_EVENTS = new Set<z.infer<typeof EventNameSchema>>([
  "registration_started",
  "registration_completed",
  "level_started",
  "level_completed",
  "payment_started",
  "payment_pending",
  "payment_verified",
  "payment_failed",
  "premium_activated",
  "premium_expired",
  "refund_completed",
  "ai_generation_requested",
  "ai_generation_completed",
  "ai_generation_failed",
  "account_export_requested",
  "account_deletion_requested",
  "reliability_error_observed",
]);

const FORBIDDEN_KEYS = new Set([
  "password",
  "passcode",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "sessionToken",
  "otp",
  "code",
  "secret",
  "secureHash",
  "integritySalt",
  "paymentSecret",
  "paymentPayload",
  "rawResponse",
  "challengeResponse",
  "email",
  "phone",
  "cnic",
  "address",
]);

const AnalyticsInputSchema = z.object({
  eventName: EventNameSchema,
  occurredAt: z.iso.datetime(),
  anonymousId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,128}$/)
    .optional(),
  sessionId: z.string().max(128).optional(),
  deduplicationKey: z.string().min(8).max(200),
  consent: z.enum(["essential", "product"]),
  properties: z.record(z.string(), z.unknown()).default({}),
  attribution: z
    .object({
      source: z.string().trim().min(1).max(100).optional(),
      medium: z.string().trim().min(1).max(100).optional(),
      campaign: z.string().trim().min(1).max(120).optional(),
      referrerHost: z.string().trim().min(1).max(255).optional(),
      referralKind: z.enum(["direct", "search", "social", "ai", "partner", "unknown"]).optional(),
    })
    .strict()
    .default({}),
});

const ExperimentInputSchema = z.object({
  experimentKey: z
    .string()
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/)
    .max(80),
  variants: z
    .array(
      z
        .string()
        .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/)
        .max(40),
    )
    .min(2)
    .max(10),
  anonymousId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,128}$/)
    .optional(),
  expiresAt: z.iso.datetime().optional(),
});

export class AnalyticsServiceError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AnalyticsServiceError";
    this.statusCode = statusCode;
  }
}

function inspectValue(value: unknown, path: string, depth: number): void {
  if (depth > 5) throw new AnalyticsServiceError(400, `Analytics nesting is too deep at ${path}.`);
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    if (value.length > 500)
      throw new AnalyticsServiceError(400, `Analytics text is too long at ${path}.`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 50)
      throw new AnalyticsServiceError(400, `Analytics array is too large at ${path}.`);
    for (const [index, entry] of value.entries())
      inspectValue(entry, `${path}[${index}]`, depth + 1);
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length > 50) {
      throw new AnalyticsServiceError(400, `Analytics object is too large at ${path}.`);
    }
    for (const [key, entry] of Object.entries(record)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key)) {
        throw new AnalyticsServiceError(400, `Invalid analytics property key: ${key}.`);
      }
      if (FORBIDDEN_KEYS.has(key)) {
        throw new AnalyticsServiceError(400, `Forbidden analytics property: ${key}.`);
      }
      inspectValue(entry, `${path}.${key}`, depth + 1);
    }
    return;
  }
  throw new AnalyticsServiceError(400, `Unsupported analytics value at ${path}.`);
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [candidateName, ...valueParts] = part.trim().split("=");
    if (candidateName === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

function requireTrustedOrigin(request: FastifyRequest, config: ApiConfig): void {
  const origin = request.headers.origin;
  if (!origin) return;
  if (origin !== new URL(config.PUBLIC_APP_URL).origin) {
    throw new AnalyticsServiceError(403, "The request origin is not allowed.");
  }
}

function subjectKey(userId: string | null, anonymousId: string | undefined): string {
  const raw = userId ? `user:${userId}` : anonymousId ? `anonymous:${anonymousId}` : null;
  if (!raw)
    throw new AnalyticsServiceError(400, "A signed-in user or anonymous identifier is required.");
  return createHash("sha256").update(raw).digest("hex");
}

function deterministicVariant(key: string, subject: string, variants: readonly string[]): string {
  const digest = createHash("sha256").update(`${key}:${subject}`).digest();
  return variants[digest.readUInt32BE(0) % variants.length] ?? variants[0] ?? "control";
}

export type AnalyticsService = Readonly<{
  ingestClient: (
    userId: string | null,
    input: z.infer<typeof AnalyticsInputSchema>,
  ) => Promise<Readonly<{ accepted: boolean; duplicate: boolean }>>;
  assignExperiment: (
    userId: string | null,
    input: z.infer<typeof ExperimentInputSchema>,
  ) => Promise<Readonly<{ experimentKey: string; variant: string; assignedAt: string }>>;
}>;

export function createAnalyticsService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    environment: ApiConfig["APP_ENV"];
    releaseSha: string;
    now?: () => Date;
  }>,
): AnalyticsService {
  const now = options.now ?? (() => new Date());

  async function consentFor(
    userId: string | null,
    supplied: "essential" | "product",
  ): Promise<"essential" | "product"> {
    if (!userId) return supplied;
    const result = await options.pool.query<{ consent_state: "essential" | "product" }>(
      `select consent_state from analytics_consents where user_id = $1`,
      [userId],
    );
    return result.rows[0]?.consent_state ?? "essential";
  }

  return {
    ingestClient: async (userId, input) => {
      inspectValue(input.properties, "properties", 0);
      inspectValue(input.attribution, "attribution", 0);
      const occurredAt = new Date(input.occurredAt);
      const receivedAt = now();
      const skew = Math.abs(receivedAt.getTime() - occurredAt.getTime());
      if (skew > 7 * 86_400_000) {
        throw new AnalyticsServiceError(
          400,
          "The analytics timestamp is outside the accepted window.",
        );
      }
      const consent = await consentFor(userId, input.consent);
      if (consent !== "product" && !ESSENTIAL_EVENTS.has(input.eventName)) {
        return { accepted: false, duplicate: false };
      }
      if (!userId && !input.anonymousId) {
        throw new AnalyticsServiceError(400, "anonymousId is required before sign-in.");
      }

      const inserted = await options.pool.query(
        `insert into analytics_events
          (event_name, event_version, authority, user_id, anonymous_id, session_id,
           deduplication_key, environment, release_sha, occurred_at, received_at,
           properties, attribution)
         values ($1, 1, 'client', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
         on conflict (deduplication_key) do nothing
         returning id`,
        [
          input.eventName,
          userId,
          userId ? null : (input.anonymousId ?? null),
          input.sessionId ?? null,
          input.deduplicationKey,
          options.environment,
          options.releaseSha,
          occurredAt,
          receivedAt,
          JSON.stringify(input.properties),
          JSON.stringify(input.attribution),
        ],
      );
      return { accepted: true, duplicate: inserted.rowCount === 0 };
    },

    assignExperiment: async (userId, input) => {
      const subject = subjectKey(userId, input.anonymousId);
      const existing = await options.pool.query<{ variant: string; assigned_at: Date }>(
        `select variant, assigned_at
           from experiment_assignments
          where experiment_key = $1 and subject_key = $2 and status = 'active'`,
        [input.experimentKey, subject],
      );
      const stored = existing.rows[0];
      if (stored) {
        return {
          experimentKey: input.experimentKey,
          variant: stored.variant,
          assignedAt: stored.assigned_at.toISOString(),
        };
      }

      const assignedAt = now();
      const variant = deterministicVariant(input.experimentKey, subject, input.variants);
      const result = await options.pool.query<{ variant: string; assigned_at: Date }>(
        `insert into experiment_assignments
          (experiment_key, subject_key, variant, status, assigned_at, expires_at)
         values ($1, $2, $3, 'active', $4, $5)
         on conflict (experiment_key, subject_key) do update
           set variant = experiment_assignments.variant
         returning variant, assigned_at`,
        [
          input.experimentKey,
          subject,
          variant,
          assignedAt,
          input.expiresAt ? new Date(input.expiresAt) : null,
        ],
      );
      const assignment = result.rows[0];
      if (!assignment) throw new AnalyticsServiceError(500, "The experiment assignment failed.");
      return {
        experimentKey: input.experimentKey,
        variant: assignment.variant,
        assignedAt: assignment.assigned_at.toISOString(),
      };
    },
  };
}

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    analyticsService: AnalyticsService;
  }>,
): void {
  async function optionalUserId(request: FastifyRequest): Promise<string | null> {
    const token = parseCookie(request.headers.cookie, options.config.SESSION_COOKIE_NAME);
    if (!token) return null;
    const learner = await options.authService.resolveSession(token);
    return learner?.id ?? null;
  }

  app.post("/v1/analytics/events", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const input = AnalyticsInputSchema.parse(request.body);
    const result = await options.analyticsService.ingestClient(
      await optionalUserId(request),
      input,
    );
    return reply.status(result.accepted ? 202 : 204).send(result.accepted ? result : undefined);
  });

  app.post("/v1/analytics/experiments/assign", async (request) => {
    requireTrustedOrigin(request, options.config);
    const input = ExperimentInputSchema.parse(request.body);
    return options.analyticsService.assignExperiment(await optionalUserId(request), input);
  });
}
