import { createHash, randomUUID } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

import type { AuthService, AuthenticatedLearner } from "./auth.js";
import type { ApiConfig } from "./config.js";

const PrivacySettingsSchema = z.object({
  analyticsConsent: z.enum(["essential", "product"]),
  marketingConsent: z.boolean(),
  leaderboardSharing: z.boolean(),
  achievementSharing: z.boolean(),
  aiPersonalization: z.boolean(),
  updatedAt: z.iso.datetime(),
});

const UpdatePrivacySettingsSchema = z
  .object({
    analyticsConsent: z.enum(["essential", "product"]).optional(),
    marketingConsent: z.boolean().optional(),
    leaderboardSharing: z.boolean().optional(),
    achievementSharing: z.boolean().optional(),
    aiPersonalization: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one privacy field is required.");

const SessionViewSchema = z.object({
  id: z.string().uuid(),
  clientLabel: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  idleExpiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  current: z.boolean(),
});

const PolicyAcceptanceInputSchema = z.object({
  policyKey: z.enum([
    "terms",
    "privacy",
    "refund",
    "ai_disclosure",
    "leaderboard_sharing",
    "fair_use",
  ]),
  version: z.string().trim().min(1).max(40),
  locale: z.enum(["en", "ur"]).default("en"),
  source: z.enum(["registration", "account_settings", "checkout", "feature_enablement"]),
});

const RequestDeletionSchema = z.object({
  confirmation: z.literal("DELETE"),
  reason: z.string().trim().min(3).max(500).optional(),
});

const DeleteSessionParamsSchema = z.object({ sessionId: z.string().uuid() });

export type PrivacySettings = z.infer<typeof PrivacySettingsSchema>;
export type AccountSessionView = z.infer<typeof SessionViewSchema>;

export class AccountLifecycleError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AccountLifecycleError";
    this.statusCode = statusCode;
  }
}

type SessionRow = Readonly<{
  id: string;
  token_digest: string;
  client_label: string | null;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  idle_expires_at: Date;
  revoked_at: Date | null;
}>;

type PrivacyRow = Readonly<{
  analytics_consent: "essential" | "product";
  marketing_consent: boolean;
  leaderboard_sharing: boolean;
  achievement_sharing: boolean;
  ai_personalization: boolean;
  updated_at: Date;
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

async function transaction<T>(
  pool: DatabaseClient["pool"],
  operation: (database: PoolClient) => Promise<T>,
): Promise<T> {
  const database = await pool.connect();
  try {
    await database.query("begin");
    const result = await operation(database);
    await database.query("commit");
    return result;
  } catch (error) {
    await database.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    database.release();
  }
}

function privacyView(row: PrivacyRow): PrivacySettings {
  return PrivacySettingsSchema.parse({
    analyticsConsent: row.analytics_consent,
    marketingConsent: row.marketing_consent,
    leaderboardSharing: row.leaderboard_sharing,
    achievementSharing: row.achievement_sharing,
    aiPersonalization: row.ai_personalization,
    updatedAt: row.updated_at.toISOString(),
  });
}

export type AccountLifecycleService = Readonly<{
  sessions: (userId: string, currentToken: string) => Promise<readonly AccountSessionView[]>;
  revokeSession: (userId: string, sessionId: string) => Promise<void>;
  revokeAllSessions: (userId: string) => Promise<void>;
  getPrivacy: (userId: string) => Promise<PrivacySettings>;
  updatePrivacy: (
    userId: string,
    patch: z.infer<typeof UpdatePrivacySettingsSchema>,
  ) => Promise<PrivacySettings>;
  acceptPolicy: (
    userId: string,
    input: z.infer<typeof PolicyAcceptanceInputSchema>,
  ) => Promise<Readonly<{ accepted: true; policyKey: string; version: string }>>;
  exportData: (userId: string) => Promise<Readonly<Record<string, unknown>>>;
  requestDeletion: (
    userId: string,
    input: z.infer<typeof RequestDeletionSchema>,
  ) => Promise<Readonly<{ requestId: string; executeAfter: string; status: "cooldown" }>>;
  cancelDeletion: (userId: string) => Promise<Readonly<{ cancelled: true }>>;
  processDueDeletions: (limit?: number) => Promise<number>;
}>;

export function createAccountLifecycleService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    sessionSecret: string;
    now?: () => Date;
  }>,
): AccountLifecycleService {
  const now = options.now ?? (() => new Date());

  async function ensurePrivacy(userId: string): Promise<PrivacyRow> {
    await options.pool.query(
      `insert into learner_privacy_settings (user_id)
       values ($1)
       on conflict (user_id) do nothing`,
      [userId],
    );
    const result = await options.pool.query<PrivacyRow>(
      `select analytics_consent, marketing_consent, leaderboard_sharing,
              achievement_sharing, ai_personalization, updated_at
         from learner_privacy_settings
        where user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) throw new AccountLifecycleError(500, "Privacy settings could not be loaded.");
    return row;
  }

  return {
    sessions: async (userId, currentToken) => {
      const currentDigest = sha256(`${options.sessionSecret}:session:${currentToken}`);
      const result = await options.pool.query<SessionRow>(
        `select id, token_digest, client_label, created_at, last_seen_at,
                expires_at, idle_expires_at, revoked_at
           from auth_sessions
          where user_id = $1
          order by created_at desc
          limit 50`,
        [userId],
      );
      return result.rows.map((row) =>
        SessionViewSchema.parse({
          id: row.id,
          clientLabel: row.client_label,
          createdAt: row.created_at.toISOString(),
          lastSeenAt: row.last_seen_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
          idleExpiresAt: row.idle_expires_at.toISOString(),
          revokedAt: row.revoked_at?.toISOString() ?? null,
          current: row.token_digest === currentDigest,
        }),
      );
    },

    revokeSession: async (userId, sessionId) => {
      const result = await options.pool.query(
        `update auth_sessions
            set revoked_at = coalesce(revoked_at, $3)
          where id = $1 and user_id = $2
          returning id`,
        [sessionId, userId, now()],
      );
      if (result.rowCount === 0) {
        throw new AccountLifecycleError(404, "The session was not found.");
      }
    },

    revokeAllSessions: async (userId) => {
      await options.pool.query(
        `update auth_sessions
            set revoked_at = coalesce(revoked_at, $2)
          where user_id = $1`,
        [userId, now()],
      );
    },

    getPrivacy: async (userId) => privacyView(await ensurePrivacy(userId)),

    updatePrivacy: async (userId, patch) => {
      const existing = await ensurePrivacy(userId);
      const updatedAt = now();
      const result = await options.pool.query<PrivacyRow>(
        `update learner_privacy_settings
            set analytics_consent = $2,
                marketing_consent = $3,
                leaderboard_sharing = $4,
                achievement_sharing = $5,
                ai_personalization = $6,
                updated_at = $7
          where user_id = $1
          returning analytics_consent, marketing_consent, leaderboard_sharing,
                    achievement_sharing, ai_personalization, updated_at`,
        [
          userId,
          patch.analyticsConsent ?? existing.analytics_consent,
          patch.marketingConsent ?? existing.marketing_consent,
          patch.leaderboardSharing ?? existing.leaderboard_sharing,
          patch.achievementSharing ?? existing.achievement_sharing,
          patch.aiPersonalization ?? existing.ai_personalization,
          updatedAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new AccountLifecycleError(500, "Privacy settings could not be updated.");
      await options.pool.query(
        `insert into analytics_consents
          (user_id, consent_state, source, policy_version, updated_at)
         values ($1, $2, 'account_settings', 'v1', $3)
         on conflict (user_id) do update
           set consent_state = excluded.consent_state,
               source = excluded.source,
               policy_version = excluded.policy_version,
               updated_at = excluded.updated_at`,
        [userId, row.analytics_consent, updatedAt],
      );
      return privacyView(row);
    },

    acceptPolicy: async (userId, input) => {
      const policy = await options.pool.query<{ id: string }>(
        `select id
           from policy_documents
          where policy_key = $1 and version = $2 and locale = $3 and status = 'active'
          limit 1`,
        [input.policyKey, input.version, input.locale],
      );
      const policyId = policy.rows[0]?.id;
      if (!policyId) throw new AccountLifecycleError(409, "The requested policy version is not active.");
      const acceptedAt = now();
      const evidenceDigest = sha256(
        `${userId}:${policyId}:${input.source}:${acceptedAt.toISOString()}`,
      );
      await options.pool.query(
        `insert into user_policy_acceptances
          (user_id, policy_document_id, accepted_at, acceptance_source, evidence_digest)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id, policy_document_id) do nothing`,
        [userId, policyId, acceptedAt, input.source, evidenceDigest],
      );
      return { accepted: true, policyKey: input.policyKey, version: input.version } as const;
    },

    exportData: async (userId) => {
      const requestedAt = now();
      const requestId = randomUUID();
      await options.pool.query(
        `insert into privacy_export_requests (id, user_id, status, requested_at)
         values ($1, $2, 'processing', $3)`,
        [requestId, userId, requestedAt],
      );

      const [identity, profile, privacy, policies, sessions, progress, payments] = await Promise.all([
        options.pool.query(
          `select email_display, verified_at, created_at
             from user_email_identities where user_id = $1`,
          [userId],
        ),
        options.pool.query(
          `select display_name, locale, age_band, avatar_key, learning_goal,
                  onboarding_status, created_at, updated_at
             from learner_profiles where user_id = $1`,
          [userId],
        ),
        options.pool.query(
          `select analytics_consent, marketing_consent, leaderboard_sharing,
                  achievement_sharing, ai_personalization, updated_at
             from learner_privacy_settings where user_id = $1`,
          [userId],
        ),
        options.pool.query(
          `select pd.policy_key, pd.version, pd.locale, upa.accepted_at, upa.acceptance_source
             from user_policy_acceptances upa
             join policy_documents pd on pd.id = upa.policy_document_id
            where upa.user_id = $1
            order by upa.accepted_at`,
          [userId],
        ),
        options.pool.query(
          `select id, client_label, created_at, last_seen_at, expires_at, revoked_at
             from auth_sessions where user_id = $1 order by created_at`,
          [userId],
        ),
        options.pool.query(
          `select level_id, level_version_id, best_awarded_points, max_points,
                  completion_count, first_completed_at, last_completed_at
             from learner_level_progress where user_id = $1 order by last_completed_at`,
          [userId],
        ),
        options.pool.query(
          `select po.merchant_reference, po.status, po.amount_minor, po.currency,
                  cp.code as plan_code, po.created_at, po.completed_at
             from payment_orders po
             join commercial_plan_versions cpv on cpv.id = po.plan_version_id
             join commercial_plans cp on cp.id = cpv.plan_id
            where po.user_id = $1
            order by po.created_at`,
          [userId],
        ),
      ]);

      const payload = {
        generatedAt: requestedAt.toISOString(),
        identity: identity.rows,
        profile: profile.rows,
        privacy: privacy.rows,
        policyAcceptances: policies.rows,
        sessions: sessions.rows,
        progress: progress.rows,
        payments: payments.rows,
      };
      const contentDigest = sha256(JSON.stringify(payload));
      const expiresAt = addDays(requestedAt, 7);
      await options.pool.query(
        `update privacy_export_requests
            set status = 'completed', completed_at = $2, expires_at = $3, content_digest = $4
          where id = $1`,
        [requestId, requestedAt, expiresAt, contentDigest],
      );
      return { requestId, expiresAt: expiresAt.toISOString(), contentDigest, data: payload };
    },

    requestDeletion: async (userId, input) =>
      transaction(options.pool, async (database) => {
        const active = await database.query<{ id: string; execute_after: Date }>(
          `select id, execute_after
             from account_deletion_requests
            where user_id = $1 and status in ('cooldown', 'processing')
            order by requested_at desc
            limit 1
            for update`,
          [userId],
        );
        const existing = active.rows[0];
        if (existing) {
          return {
            requestId: existing.id,
            executeAfter: existing.execute_after.toISOString(),
            status: "cooldown" as const,
          };
        }
        const requestId = randomUUID();
        const requestedAt = now();
        const executeAfter = addDays(requestedAt, 7);
        await database.query(
          `insert into account_deletion_requests
            (id, user_id, status, reason, requested_at, execute_after)
           values ($1, $2, 'cooldown', $3, $4, $5)`,
          [requestId, userId, input.reason ?? null, requestedAt, executeAfter],
        );
        return { requestId, executeAfter: executeAfter.toISOString(), status: "cooldown" as const };
      }),

    cancelDeletion: async (userId) => {
      const result = await options.pool.query(
        `update account_deletion_requests
            set status = 'cancelled', cancelled_at = $2
          where user_id = $1 and status = 'cooldown'
          returning id`,
        [userId, now()],
      );
      if (result.rowCount === 0) {
        throw new AccountLifecycleError(404, "No cancellable deletion request was found.");
      }
      return { cancelled: true } as const;
    },

    processDueDeletions: async (limit = 25) => {
      const safeLimit = z.number().int().min(1).max(100).parse(limit);
      return transaction(options.pool, async (database) => {
        const due = await database.query<{ id: string; user_id: string }>(
          `select id, user_id
             from account_deletion_requests
            where status = 'cooldown' and execute_after <= $1
            order by execute_after
            limit $2
            for update skip locked`,
          [now(), safeLimit],
        );
        for (const request of due.rows) {
          const processedAt = now();
          await database.query(
            `update account_deletion_requests set status = 'processing' where id = $1`,
            [request.id],
          );
          await database.query(
            `update auth_sessions
                set revoked_at = coalesce(revoked_at, $2)
              where user_id = $1`,
            [request.user_id, processedAt],
          );
          const deletedEmail = `deleted+${request.user_id}@invalid.local`;
          await database.query(
            `update user_email_identities
                set email_normalized = $2, email_display = $2, updated_at = $3
              where user_id = $1`,
            [request.user_id, deletedEmail, processedAt],
          );
          await database.query(
            `update learner_profiles
                set display_name = null,
                    locale = 'en',
                    age_band = 'unspecified',
                    avatar_key = null,
                    learning_goal = null,
                    onboarding_status = 'not_started',
                    updated_at = $2
              where user_id = $1`,
            [request.user_id, processedAt],
          );
          await database.query(
            `update challenge_attempts
                set response_payload = '{}'::jsonb
              where user_id = $1`,
            [request.user_id],
          );
          await database.query(`delete from learner_privacy_settings where user_id = $1`, [
            request.user_id,
          ]);
          await database.query(`delete from analytics_consents where user_id = $1`, [request.user_id]);
          await database.query(
            `delete from analytics_events where user_id = $1 and authority = 'client'`,
            [request.user_id],
          );
          await database.query(
            `update users set status = 'suspended', updated_at = $2 where id = $1`,
            [request.user_id, processedAt],
          );
          await database.query(
            `update account_deletion_requests
                set status = 'completed', completed_at = $2, completed_by = 'system'
              where id = $1`,
            [request.id, processedAt],
          );
        }
        return due.rows.length;
      });
    },
  };
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
    throw new AccountLifecycleError(403, "The request origin is not allowed.");
  }
}

async function requireLearnerAndToken(
  request: FastifyRequest,
  config: ApiConfig,
  authService: AuthService,
): Promise<Readonly<{ learner: AuthenticatedLearner; sessionToken: string }>> {
  const sessionToken = parseCookie(request.headers.cookie, config.SESSION_COOKIE_NAME);
  if (!sessionToken) throw new AccountLifecycleError(401, "Authentication is required.");
  const learner = await authService.resolveSession(sessionToken);
  if (!learner) throw new AccountLifecycleError(401, "The session is invalid or expired.");
  return { learner, sessionToken };
}

export function registerAccountLifecycleRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    accountLifecycleService: AccountLifecycleService;
  }>,
): void {
  app.get("/v1/account/sessions", async (request) => {
    const auth = await requireLearnerAndToken(request, options.config, options.authService);
    return { sessions: await options.accountLifecycleService.sessions(auth.learner.id, auth.sessionToken) };
  });

  app.delete("/v1/account/sessions/:sessionId", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const auth = await requireLearnerAndToken(request, options.config, options.authService);
    const params = DeleteSessionParamsSchema.parse(request.params);
    await options.accountLifecycleService.revokeSession(auth.learner.id, params.sessionId);
    return reply.status(204).send();
  });

  app.delete("/v1/account/sessions", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const auth = await requireLearnerAndToken(request, options.config, options.authService);
    await options.accountLifecycleService.revokeAllSessions(auth.learner.id);
    return reply.status(204).send();
  });

  app.get("/v1/account/privacy", async (request) => {
    const auth = await requireLearnerAndToken(request, options.config, options.authService);
    return options.accountLifecycleService.getPrivacy(auth.learner.id);
  });

  app.patch("/v1/account/privacy", async (request) => {
    requireTrustedOrigin(request, options.config);
    const auth = await requireLearnerAndToken(request, options.config, options.authService);
    return options.accountLifecycleService.updatePrivacy(
      auth.learner.id,
      UpdatePrivacySettingsSchema.parse(request.body),
    );
  });

  app.post("/v1/account/policies/accept", async (request) => {
    requireTrustedOrigin(request, options.config);
    const auth = await requireLearnerAndToken(request, options.config, options.authService);
    return options.accountLifecycleService.acceptPolicy(
      auth.learner.id,
      PolicyAcceptanceInputSchema.parse(request.body),
    );
  });

  app.post("/v1/account/export", async (request) => {
    requireTrustedOrigin(request, options.config);
    const auth = await requireLearnerAndToken(request, options.config, options.authService);
    return options.accountLifecycleService.exportData(auth.learner.id);
  });

  app.post("/v1/account/deletion", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const auth = await requireLearnerAndToken(request, options.config, options.authService);
    return reply.status(202).send(
      await options.accountLifecycleService.requestDeletion(
        auth.learner.id,
        RequestDeletionSchema.parse(request.body),
      ),
    );
  });

  app.delete("/v1/account/deletion", async (request) => {
    requireTrustedOrigin(request, options.config);
    const auth = await requireLearnerAndToken(request, options.config, options.authService);
    return options.accountLifecycleService.cancelDeletion(auth.learner.id);
  });
}
