import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { ApiConfig } from "./config.js";

const StartEmailSignInSchema = z.object({
  email: z.string().trim().email().max(254),
});

const VerifyEmailSignInSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{4}$/),
});

const UpdateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(60).nullable().optional(),
    locale: z.enum(["en", "ur"]).optional(),
    ageBand: z.enum(["16_17", "18_24", "25_34", "35_plus", "unspecified"]).optional(),
    avatarKey: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80)
      .nullable()
      .optional(),
    learningGoal: z.string().trim().min(3).max(240).nullable().optional(),
    onboardingStatus: z.enum(["not_started", "in_progress", "completed"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one profile field is required.");

export type LearnerProfile = Readonly<{
  displayName: string | null;
  locale: "en" | "ur";
  ageBand: "16_17" | "18_24" | "25_34" | "35_plus" | "unspecified";
  avatarKey: string | null;
  learningGoal: string | null;
  onboardingStatus: "not_started" | "in_progress" | "completed";
}>;

export type AuthenticatedLearner = Readonly<{
  id: string;
  email: string;
  profile: LearnerProfile;
}>;

type LearnerRow = Readonly<{
  user_id: unknown;
  email_display: unknown;
  display_name: unknown;
  locale: unknown;
  age_band: unknown;
  avatar_key: unknown;
  learning_goal: unknown;
  onboarding_status: unknown;
}>;

type SessionLearnerRow = LearnerRow &
  Readonly<{
    session_id: unknown;
    expires_at: unknown;
  }>;

export type AuthCodeDelivery = Readonly<{
  sendSignInCode: (
    input: Readonly<{ email: string; code: string; expiresAt: Date }>,
  ) => Promise<void>;
}>;

export type AuthService = Readonly<{
  startEmailSignIn: (
    input: Readonly<{
      email: string;
      requestFingerprint: string;
    }>,
  ) => Promise<Readonly<{ challengeId: string; expiresAt: Date }>>;
  verifyEmailSignIn: (
    input: Readonly<{
      challengeId: string;
      code: string;
    }>,
  ) => Promise<
    Readonly<{
      sessionToken: string;
      sessionExpiresAt: Date;
      learner: AuthenticatedLearner;
    }>
  >;
  resolveSession: (sessionToken: string) => Promise<AuthenticatedLearner | null>;
  revokeSession: (sessionToken: string) => Promise<void>;
  updateProfile: (
    userId: string,
    patch: z.infer<typeof UpdateProfileSchema>,
  ) => Promise<AuthenticatedLearner>;
}>;

class AuthRequestError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AuthRequestError";
    this.statusCode = statusCode;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

function digest(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function digestsMatch(leftHex: string, rightHex: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(leftHex) || !/^[a-f0-9]{64}$/.test(rightHex)) return false;
  return timingSafeEqual(Buffer.from(leftHex, "hex"), Buffer.from(rightHex, "hex"));
}

function generateCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

function profileFromRow(row: LearnerRow): LearnerProfile {
  return {
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    locale: row.locale === "ur" ? "ur" : "en",
    ageBand:
      row.age_band === "16_17" ||
      row.age_band === "18_24" ||
      row.age_band === "25_34" ||
      row.age_band === "35_plus"
        ? row.age_band
        : "unspecified",
    avatarKey: typeof row.avatar_key === "string" ? row.avatar_key : null,
    learningGoal: typeof row.learning_goal === "string" ? row.learning_goal : null,
    onboardingStatus:
      row.onboarding_status === "in_progress" || row.onboarding_status === "completed"
        ? row.onboarding_status
        : "not_started",
  };
}

function learnerFromRow(row: LearnerRow): AuthenticatedLearner {
  if (typeof row.user_id !== "string" || typeof row.email_display !== "string") {
    throw new Error("The authentication query returned an invalid learner record.");
  }

  return {
    id: row.user_id,
    email: row.email_display,
    profile: profileFromRow(row),
  };
}

export function createUnavailableAuthCodeDelivery(): AuthCodeDelivery {
  return {
    sendSignInCode: async () => {
      throw new AuthRequestError(503, "Sign-in email delivery is temporarily unavailable.");
    },
  };
}

export function createAuthService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    secret: string;
    challengeMinutes: number;
    sessionIdleMinutes: number;
    sessionAbsoluteHours: number;
    delivery: AuthCodeDelivery;
    now?: () => Date;
    createCode?: () => string;
    createSessionToken?: () => string;
  }>,
): AuthService {
  const now = options.now ?? (() => new Date());
  const createCode = options.createCode ?? generateCode;
  const createToken = options.createSessionToken ?? generateSessionToken;

  return {
    startEmailSignIn: async ({ email, requestFingerprint }) => {
      const requestedAt = now();
      const emailNormalized = normalizeEmail(email);
      const fingerprintDigest = digest(options.secret, `fingerprint:${requestFingerprint}`);
      const cutoff = addMinutes(requestedAt, -15);

      const limits = await options.pool.query<{ email_count: string; fingerprint_count: string }>(
        `select
          (select count(*) from auth_challenges where email_normalized = $1 and created_at >= $2) as email_count,
          (select count(*) from auth_challenges where request_fingerprint_digest = $3 and created_at >= $2) as fingerprint_count`,
        [emailNormalized, cutoff, fingerprintDigest],
      );

      const counts = limits.rows[0];
      if (Number(counts?.email_count ?? 0) >= 5 || Number(counts?.fingerprint_count ?? 0) >= 20) {
        throw new AuthRequestError(429, "Please wait before requesting another sign-in code.");
      }

      const challengeId = randomUUID();
      const code = createCode();
      const expiresAt = addMinutes(requestedAt, options.challengeMinutes);
      const secretDigest = digest(options.secret, `challenge:${challengeId}:${code}`);

      await options.delivery.sendSignInCode({ email, code, expiresAt });
      await options.pool.query(
        `insert into auth_challenges
          (id, email_normalized, purpose, secret_digest, request_fingerprint_digest, attempts_remaining, expires_at, created_at)
         values ($1, $2, 'sign_in', $3, $4, 5, $5, $6)`,
        [challengeId, emailNormalized, secretDigest, fingerprintDigest, expiresAt, requestedAt],
      );

      return { challengeId, expiresAt };
    },

    verifyEmailSignIn: async ({ challengeId, code }) => {
      const verifiedAt = now();
      const client = await options.pool.connect();

      try {
        await client.query("begin");
        const challengeResult = await client.query<{
          email_normalized: string;
          secret_digest: string;
          attempts_remaining: number;
          expires_at: Date;
          consumed_at: Date | null;
        }>(
          `select email_normalized, secret_digest, attempts_remaining, expires_at, consumed_at
             from auth_challenges
            where id = $1 and purpose = 'sign_in'
            for update`,
          [challengeId],
        );

        const challenge = challengeResult.rows[0];
        const invalidOrExpired =
          !challenge ||
          challenge.consumed_at !== null ||
          challenge.attempts_remaining <= 0 ||
          challenge.expires_at.getTime() <= verifiedAt.getTime();

        const presentedDigest = digest(options.secret, `challenge:${challengeId}:${code}`);
        if (invalidOrExpired || !digestsMatch(challenge.secret_digest, presentedDigest)) {
          if (challenge && challenge.consumed_at === null && challenge.attempts_remaining > 0) {
            await client.query(
              "update auth_challenges set attempts_remaining = greatest(attempts_remaining - 1, 0) where id = $1",
              [challengeId],
            );
          }
          await client.query("commit");
          throw new AuthRequestError(400, "The sign-in code is invalid or expired.");
        }

        await client.query(
          "update auth_challenges set consumed_at = $2, attempts_remaining = 0 where id = $1",
          [challengeId, verifiedAt],
        );

        const existingIdentity = await client.query<{ user_id: string; email_display: string }>(
          `select e.user_id, e.email_display
             from user_email_identities e
             join users u on u.id = e.user_id
            where e.email_normalized = $1 and u.status = 'active'
            for update`,
          [challenge.email_normalized],
        );

        let userId: string;
        let emailDisplay: string;
        if (existingIdentity.rows[0]) {
          userId = existingIdentity.rows[0].user_id;
          emailDisplay = existingIdentity.rows[0].email_display;
        } else {
          const user = await client.query<{ id: string }>(
            "insert into users (status, created_at, updated_at) values ('active', $1, $1) returning id",
            [verifiedAt],
          );
          const createdUserId = user.rows[0]?.id;
          if (!createdUserId) throw new Error("The learner account could not be created.");
          userId = createdUserId;
          emailDisplay = challenge.email_normalized;

          await client.query(
            `insert into user_email_identities
              (user_id, email_normalized, email_display, verified_at, created_at, updated_at)
             values ($1, $2, $2, $3, $3, $3)`,
            [userId, challenge.email_normalized, verifiedAt],
          );
          await client.query(
            "insert into learner_profiles (user_id, created_at, updated_at) values ($1, $2, $2)",
            [userId, verifiedAt],
          );
        }

        const sessionToken = createToken();
        const sessionTokenDigest = digest(options.secret, `session:${sessionToken}`);
        const sessionExpiresAt = addHours(verifiedAt, options.sessionAbsoluteHours);
        const idleExpiresAt = addMinutes(verifiedAt, options.sessionIdleMinutes);

        await client.query(
          `insert into auth_sessions
            (user_id, token_digest, expires_at, idle_expires_at, last_seen_at, created_at)
           values ($1, $2, $3::timestamptz, least($4::timestamptz, $3::timestamptz), $5::timestamptz, $5::timestamptz)`,
          [userId, sessionTokenDigest, sessionExpiresAt, idleExpiresAt, verifiedAt],
        );

        const profile = await client.query<LearnerRow>(
          `select $1::uuid as user_id, $2::text as email_display,
                  display_name, locale, age_band, avatar_key, learning_goal, onboarding_status
             from learner_profiles where user_id = $1`,
          [userId, emailDisplay],
        );
        const row = profile.rows[0];
        if (!row) throw new Error("The learner profile could not be loaded.");

        await client.query("commit");
        return {
          sessionToken,
          sessionExpiresAt,
          learner: learnerFromRow(row),
        };
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    resolveSession: async (sessionToken) => {
      const seenAt = now();
      const tokenDigest = digest(options.secret, `session:${sessionToken}`);
      const result = await options.pool.query<SessionLearnerRow>(
        `select s.id as session_id, s.expires_at, u.id as user_id, e.email_display,
                p.display_name, p.locale, p.age_band, p.avatar_key, p.learning_goal, p.onboarding_status
           from auth_sessions s
           join users u on u.id = s.user_id
           join user_email_identities e on e.user_id = u.id
           join learner_profiles p on p.user_id = u.id
          where s.token_digest = $1
            and s.revoked_at is null
            and s.expires_at > $2
            and s.idle_expires_at > $2
            and u.status = 'active'
          limit 1`,
        [tokenDigest, seenAt],
      );
      const row = result.rows[0];
      if (!row || typeof row.session_id !== "string" || !(row.expires_at instanceof Date)) {
        return null;
      }

      const extendedIdle = addMinutes(seenAt, options.sessionIdleMinutes);
      await options.pool.query(
        `update auth_sessions
            set last_seen_at = $2, idle_expires_at = least(expires_at, $3)
          where id = $1 and last_seen_at < $2 - interval '5 minutes'`,
        [row.session_id, seenAt, extendedIdle],
      );

      return learnerFromRow(row);
    },

    revokeSession: async (sessionToken) => {
      const tokenDigest = digest(options.secret, `session:${sessionToken}`);
      await options.pool.query(
        "update auth_sessions set revoked_at = coalesce(revoked_at, $2) where token_digest = $1",
        [tokenDigest, now()],
      );
    },

    updateProfile: async (userId, patch) => {
      const updatedAt = now();
      const current = await options.pool.query<LearnerRow>(
        `select u.id as user_id, e.email_display, p.display_name, p.locale, p.age_band,
                p.avatar_key, p.learning_goal, p.onboarding_status
           from users u
           join user_email_identities e on e.user_id = u.id
           join learner_profiles p on p.user_id = u.id
          where u.id = $1 and u.status = 'active'`,
        [userId],
      );
      const existing = current.rows[0];
      if (!existing) throw new AuthRequestError(404, "The learner profile was not found.");

      const merged = {
        displayName:
          patch.displayName === undefined
            ? profileFromRow(existing).displayName
            : patch.displayName,
        locale: patch.locale ?? profileFromRow(existing).locale,
        ageBand: patch.ageBand ?? profileFromRow(existing).ageBand,
        avatarKey:
          patch.avatarKey === undefined ? profileFromRow(existing).avatarKey : patch.avatarKey,
        learningGoal:
          patch.learningGoal === undefined
            ? profileFromRow(existing).learningGoal
            : patch.learningGoal,
        onboardingStatus: patch.onboardingStatus ?? profileFromRow(existing).onboardingStatus,
      };

      const updated = await options.pool.query<LearnerRow>(
        `update learner_profiles
            set display_name = $2, locale = $3, age_band = $4, avatar_key = $5,
                learning_goal = $6, onboarding_status = $7, updated_at = $8
          where user_id = $1
          returning $1::uuid as user_id, $9::text as email_display,
                    display_name, locale, age_band, avatar_key, learning_goal, onboarding_status`,
        [
          userId,
          merged.displayName,
          merged.locale,
          merged.ageBand,
          merged.avatarKey,
          merged.learningGoal,
          merged.onboardingStatus,
          updatedAt,
          existing.email_display,
        ],
      );
      const row = updated.rows[0];
      if (!row) throw new Error("The learner profile could not be updated.");
      return learnerFromRow(row);
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

function sessionCookie(config: ApiConfig, token: string, expiresAt: Date): string {
  const secure = config.APP_ENV === "staging" || config.APP_ENV === "production";
  const attributes = [
    `${config.SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function clearedSessionCookie(config: ApiConfig): string {
  const secure = config.APP_ENV === "staging" || config.APP_ENV === "production";
  const attributes = [
    `${config.SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function requireTrustedOrigin(request: FastifyRequest, config: ApiConfig): void {
  const origin = request.headers.origin;
  if (!origin) return;
  if (origin !== new URL(config.PUBLIC_APP_URL).origin) {
    throw new AuthRequestError(403, "The request origin is not allowed.");
  }
}

function requestFingerprint(request: FastifyRequest): string {
  const userAgent = request.headers["user-agent"] ?? "unknown";
  return `${request.ip}|${userAgent}`;
}

async function requireLearner(
  request: FastifyRequest,
  config: ApiConfig,
  authService: AuthService,
): Promise<Readonly<{ learner: AuthenticatedLearner; sessionToken: string }>> {
  const sessionToken = parseCookie(request.headers.cookie, config.SESSION_COOKIE_NAME);
  if (!sessionToken) throw new AuthRequestError(401, "Authentication is required.");
  const learner = await authService.resolveSession(sessionToken);
  if (!learner) throw new AuthRequestError(401, "The session is invalid or expired.");
  return { learner, sessionToken };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  options: Readonly<{ config: ApiConfig; authService: AuthService }>,
): void {
  app.post("/v1/auth/email/start", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const body = StartEmailSignInSchema.parse(request.body);
    const challenge = await options.authService.startEmailSignIn({
      email: body.email,
      requestFingerprint: requestFingerprint(request),
    });
    return reply.status(202).send({
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt.toISOString(),
      message: "If email delivery is available, a sign-in code has been sent.",
    });
  });

  app.post("/v1/auth/email/verify", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const body = VerifyEmailSignInSchema.parse(request.body);
    const verified = await options.authService.verifyEmailSignIn(body);
    reply.header(
      "set-cookie",
      sessionCookie(options.config, verified.sessionToken, verified.sessionExpiresAt),
    );
    return reply.status(200).send({ learner: verified.learner });
  });

  app.get("/v1/auth/session", async (request) => {
    const { learner } = await requireLearner(request, options.config, options.authService);
    return { learner };
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const sessionToken = parseCookie(request.headers.cookie, options.config.SESSION_COOKIE_NAME);
    if (sessionToken) await options.authService.revokeSession(sessionToken);
    reply.header("set-cookie", clearedSessionCookie(options.config));
    return reply.status(204).send();
  });

  app.patch("/v1/profile", async (request) => {
    requireTrustedOrigin(request, options.config);
    const { learner } = await requireLearner(request, options.config, options.authService);
    const patch = UpdateProfileSchema.parse(request.body);
    return { learner: await options.authService.updateProfile(learner.id, patch) };
  });
}
