import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

import type { ApiConfig } from "./config.js";

export type AuthIdentityType = "email" | "phone";

const StartOtpSchema = z.object({
  identity: z.string().trim().min(3).max(254),
});

const StartEmailSignInSchema = z.object({
  email: z.string().trim().email().max(254),
});

const VerifyOtpSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{4}$/),
});

const IdentityTypeParamsSchema = z.object({
  type: z.enum(["email", "phone"]),
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
  email: string | null;
  phone: string | null;
  profile: LearnerProfile;
}>;

export type AuthIdentityView = Readonly<{
  type: AuthIdentityType;
  display: string;
  masked: string;
  verifiedAt: string;
}>;

type NormalizedIdentity = Readonly<{
  type: AuthIdentityType;
  normalized: string;
  display: string;
  masked: string;
}>;

type LearnerRow = Readonly<{
  user_id: unknown;
  email_display: unknown;
  phone_display: unknown;
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

type ChallengeRow = Readonly<{
  identity_type: AuthIdentityType;
  identity_normalized: string;
  identity_display: string;
  user_id: string | null;
  secret_digest: string;
  attempts_remaining: number;
  expires_at: Date;
  consumed_at: Date | null;
}>;

export type AuthCodeDelivery = Readonly<{
  sendSignInCode: (
    input: Readonly<{
      channel: AuthIdentityType;
      destination: string;
      display: string;
      code: string;
      expiresAt: Date;
    }>,
  ) => Promise<void>;
}>;

type VerifiedSession = Readonly<{
  sessionToken: string;
  sessionExpiresAt: Date;
  learner: AuthenticatedLearner;
}>;

type ChallengeView = Readonly<{
  challengeId: string;
  expiresAt: Date;
  channel: AuthIdentityType;
  maskedDestination: string;
}>;

export type AuthService = Readonly<{
  startSignIn: (
    input: Readonly<{ identity: string; requestFingerprint: string }>,
  ) => Promise<ChallengeView>;
  verifySignIn: (
    input: Readonly<{ challengeId: string; code: string }>,
  ) => Promise<VerifiedSession>;
  startEmailSignIn: (
    input: Readonly<{ email: string; requestFingerprint: string }>,
  ) => Promise<Readonly<{ challengeId: string; expiresAt: Date }>>;
  verifyEmailSignIn: (
    input: Readonly<{ challengeId: string; code: string }>,
  ) => Promise<VerifiedSession>;
  listIdentities: (userId: string) => Promise<readonly AuthIdentityView[]>;
  startIdentityLink: (
    input: Readonly<{ userId: string; identity: string; requestFingerprint: string }>,
  ) => Promise<ChallengeView>;
  verifyIdentityLink: (
    input: Readonly<{ userId: string; challengeId: string; code: string }>,
  ) => Promise<readonly AuthIdentityView[]>;
  removeIdentity: (
    input: Readonly<{ userId: string; type: AuthIdentityType }>,
  ) => Promise<readonly AuthIdentityView[]>;
  resolveSession: (sessionToken: string) => Promise<AuthenticatedLearner | null>;
  revokeSession: (sessionToken: string) => Promise<void>;
  updateProfile: (
    userId: string,
    patch: z.infer<typeof UpdateProfileSchema>,
  ) => Promise<AuthenticatedLearner>;
}>;

export class AuthRequestError extends Error {
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

export function normalizePakistanMobile(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");
  let normalized: string;

  if (/^\+923\d{9}$/.test(compact)) {
    normalized = compact;
  } else if (/^00923\d{9}$/.test(compact)) {
    normalized = `+${compact.slice(2)}`;
  } else if (/^923\d{9}$/.test(compact)) {
    normalized = `+${compact}`;
  } else if (/^03\d{9}$/.test(compact)) {
    normalized = `+92${compact.slice(1)}`;
  } else if (/^3\d{9}$/.test(compact)) {
    normalized = `+92${compact}`;
  } else {
    throw new AuthRequestError(400, "Enter a valid Pakistani mobile number or email address.");
  }

  if (!/^\+923\d{9}$/.test(normalized)) {
    throw new AuthRequestError(400, "Enter a valid Pakistani mobile number or email address.");
  }
  return normalized;
}

function phoneDisplay(normalized: string): string {
  return `0${normalized.slice(3)}`;
}

function maskPhone(normalized: string): string {
  const local = phoneDisplay(normalized);
  return `${local.slice(0, 4)} *** ${local.slice(-4)}`;
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

export function normalizeAuthIdentity(value: string): NormalizedIdentity {
  const input = value.trim();
  if (input.includes("@")) {
    const parsed = z.string().trim().email().max(254).safeParse(input);
    if (!parsed.success) {
      throw new AuthRequestError(400, "Enter a valid Pakistani mobile number or email address.");
    }
    const normalized = normalizeEmail(parsed.data);
    return {
      type: "email",
      normalized,
      display: normalized,
      masked: maskEmail(normalized),
    };
  }

  const normalized = normalizePakistanMobile(input);
  return {
    type: "phone",
    normalized,
    display: phoneDisplay(normalized),
    masked: maskPhone(normalized),
  };
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
  if (typeof row.user_id !== "string") {
    throw new Error("The authentication query returned an invalid learner record.");
  }
  const email = typeof row.email_display === "string" ? row.email_display : null;
  const phone = typeof row.phone_display === "string" ? row.phone_display : null;
  if (!email && !phone) {
    throw new Error("The learner has no verified login identity.");
  }

  return {
    id: row.user_id,
    email,
    phone,
    profile: profileFromRow(row),
  };
}

async function loadLearner(
  client: Pick<DatabaseClient["pool"], "query">,
  userId: string,
): Promise<AuthenticatedLearner> {
  const result = await client.query<LearnerRow>(
    `select u.id as user_id, e.email_display, ph.phone_display,
            p.display_name, p.locale, p.age_band, p.avatar_key, p.learning_goal, p.onboarding_status
       from users u
       join learner_profiles p on p.user_id = u.id
       left join user_email_identities e on e.user_id = u.id
       left join user_phone_identities ph on ph.user_id = u.id
      where u.id = $1 and u.status = 'active'
      limit 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new AuthRequestError(404, "The learner profile was not found.");
  return learnerFromRow(row);
}

async function identityOwner(
  client: Pick<PoolClient, "query"> | Pick<DatabaseClient["pool"], "query">,
  identity: NormalizedIdentity,
): Promise<Readonly<{ userId: string; status: string }> | null> {
  const result =
    identity.type === "email"
      ? await client.query<{ user_id: string; status: string }>(
          `select e.user_id, u.status
             from user_email_identities e
             join users u on u.id = e.user_id
            where e.email_normalized = $1
            limit 1`,
          [identity.normalized],
        )
      : await client.query<{ user_id: string; status: string }>(
          `select ph.user_id, u.status
             from user_phone_identities ph
             join users u on u.id = ph.user_id
            where ph.phone_normalized = $1
            limit 1`,
          [identity.normalized],
        );

  const row = result.rows[0];
  return row ? { userId: row.user_id, status: row.status } : null;
}

async function insertIdentity(
  client: Pick<PoolClient, "query">,
  userId: string,
  identity: NormalizedIdentity,
  verifiedAt: Date,
  replaceForUser: boolean,
): Promise<void> {
  if (identity.type === "email") {
    if (replaceForUser) {
      await client.query(
        `insert into user_email_identities
          (user_id, email_normalized, email_display, verified_at, created_at, updated_at)
         values ($1, $2, $3, $4, $4, $4)
         on conflict (user_id) do update
           set email_normalized = excluded.email_normalized,
               email_display = excluded.email_display,
               verified_at = excluded.verified_at,
               updated_at = excluded.updated_at`,
        [userId, identity.normalized, identity.display, verifiedAt],
      );
    } else {
      await client.query(
        `insert into user_email_identities
          (user_id, email_normalized, email_display, verified_at, created_at, updated_at)
         values ($1, $2, $3, $4, $4, $4)`,
        [userId, identity.normalized, identity.display, verifiedAt],
      );
    }
    return;
  }

  if (replaceForUser) {
    await client.query(
      `insert into user_phone_identities
        (user_id, phone_normalized, phone_display, verified_at, created_at, updated_at)
       values ($1, $2, $3, $4, $4, $4)
       on conflict (user_id) do update
         set phone_normalized = excluded.phone_normalized,
             phone_display = excluded.phone_display,
             verified_at = excluded.verified_at,
             updated_at = excluded.updated_at`,
      [userId, identity.normalized, identity.display, verifiedAt],
    );
  } else {
    await client.query(
      `insert into user_phone_identities
        (user_id, phone_normalized, phone_display, verified_at, created_at, updated_at)
       values ($1, $2, $3, $4, $4, $4)`,
      [userId, identity.normalized, identity.display, verifiedAt],
    );
  }
}

async function identityViews(
  client: Pick<DatabaseClient["pool"], "query"> | Pick<PoolClient, "query">,
  userId: string,
): Promise<readonly AuthIdentityView[]> {
  const [emailResult, phoneResult] = await Promise.all([
    client.query<{ email_display: string; verified_at: Date }>(
      `select email_display, verified_at
         from user_email_identities
        where user_id = $1`,
      [userId],
    ),
    client.query<{ phone_normalized: string; phone_display: string; verified_at: Date }>(
      `select phone_normalized, phone_display, verified_at
         from user_phone_identities
        where user_id = $1`,
      [userId],
    ),
  ]);

  const identities: AuthIdentityView[] = [];
  const email = emailResult.rows[0];
  if (email) {
    identities.push({
      type: "email",
      display: email.email_display,
      masked: maskEmail(email.email_display),
      verifiedAt: email.verified_at.toISOString(),
    });
  }
  const phone = phoneResult.rows[0];
  if (phone) {
    identities.push({
      type: "phone",
      display: phone.phone_display,
      masked: maskPhone(phone.phone_normalized),
      verifiedAt: phone.verified_at.toISOString(),
    });
  }
  return identities;
}

export function createUnavailableAuthCodeDelivery(): AuthCodeDelivery {
  return {
    sendSignInCode: async () => {
      throw new AuthRequestError(503, "Sign-in code delivery is temporarily unavailable.");
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

  async function createChallenge(input: Readonly<{
    identity: NormalizedIdentity;
    purpose: "sign_in" | "link_identity";
    userId: string | null;
    requestFingerprint: string;
  }>): Promise<ChallengeView> {
    const requestedAt = now();
    const fingerprintDigest = digest(options.secret, `fingerprint:${input.requestFingerprint}`);
    const cutoff = addMinutes(requestedAt, -15);

    const limits = await options.pool.query<{
      identity_count: string;
      fingerprint_count: string;
    }>(
      `select
        (select count(*) from auth_challenges
          where identity_type = $1 and identity_normalized = $2 and created_at >= $3) as identity_count,
        (select count(*) from auth_challenges
          where request_fingerprint_digest = $4 and created_at >= $3) as fingerprint_count`,
      [input.identity.type, input.identity.normalized, cutoff, fingerprintDigest],
    );

    const counts = limits.rows[0];
    if (
      Number(counts?.identity_count ?? 0) >= 5 ||
      Number(counts?.fingerprint_count ?? 0) >= 20
    ) {
      throw new AuthRequestError(429, "Please wait before requesting another sign-in code.");
    }

    const challengeId = randomUUID();
    const code = createCode();
    const expiresAt = addMinutes(requestedAt, options.challengeMinutes);
    const secretDigest = digest(options.secret, `challenge:${challengeId}:${code}`);

    await options.delivery.sendSignInCode({
      channel: input.identity.type,
      destination: input.identity.normalized,
      display: input.identity.display,
      code,
      expiresAt,
    });

    await options.pool.query(
      `insert into auth_challenges
        (id, identity_type, identity_normalized, identity_display, user_id, purpose,
         secret_digest, request_fingerprint_digest, attempts_remaining, expires_at, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 5, $9, $10)`,
      [
        challengeId,
        input.identity.type,
        input.identity.normalized,
        input.identity.display,
        input.userId,
        input.purpose,
        secretDigest,
        fingerprintDigest,
        expiresAt,
        requestedAt,
      ],
    );

    return {
      challengeId,
      expiresAt,
      channel: input.identity.type,
      maskedDestination: input.identity.masked,
    };
  }

  async function readChallenge(
    client: PoolClient,
    input: Readonly<{
      challengeId: string;
      code: string;
      purpose: "sign_in" | "link_identity";
      userId?: string;
    }>,
  ): Promise<Readonly<{ challenge: ChallengeRow; identity: NormalizedIdentity }>> {
    const verifiedAt = now();
    const result = await client.query<ChallengeRow>(
      `select identity_type, identity_normalized, identity_display, user_id,
              secret_digest, attempts_remaining, expires_at, consumed_at
         from auth_challenges
        where id = $1 and purpose = $2
        for update`,
      [input.challengeId, input.purpose],
    );

    const challenge = result.rows[0];
    const invalidOrExpired =
      !challenge ||
      challenge.consumed_at !== null ||
      challenge.attempts_remaining <= 0 ||
      challenge.expires_at.getTime() <= verifiedAt.getTime() ||
      (input.userId !== undefined && challenge.user_id !== input.userId);

    const presentedDigest = digest(
      options.secret,
      `challenge:${input.challengeId}:${input.code}`,
    );
    if (invalidOrExpired || !digestsMatch(challenge.secret_digest, presentedDigest)) {
      if (challenge && challenge.consumed_at === null && challenge.attempts_remaining > 0) {
        await client.query(
          "update auth_challenges set attempts_remaining = greatest(attempts_remaining - 1, 0) where id = $1",
          [input.challengeId],
        );
      }
      throw new AuthRequestError(400, "The sign-in code is invalid or expired.");
    }

    const identity = normalizeAuthIdentity(challenge.identity_normalized);
    if (identity.type !== challenge.identity_type) {
      throw new Error("The authentication challenge identity type is inconsistent.");
    }

    return { challenge, identity };
  }

  const service: AuthService = {
    startSignIn: async ({ identity, requestFingerprint }) =>
      createChallenge({
        identity: normalizeAuthIdentity(identity),
        purpose: "sign_in",
        userId: null,
        requestFingerprint,
      }),

    verifySignIn: async ({ challengeId, code }) => {
      const verifiedAt = now();
      const client = await options.pool.connect();

      try {
        await client.query("begin");
        const { challenge, identity } = await readChallenge(client, {
          challengeId,
          code,
          purpose: "sign_in",
        });

        await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
          `${identity.type}:${identity.normalized}`,
        ]);

        const owner = await identityOwner(client, identity);
        let userId: string;
        if (owner) {
          if (owner.status !== "active") {
            throw new AuthRequestError(403, "This account is not available for sign-in.");
          }
          userId = owner.userId;
        } else {
          const user = await client.query<{ id: string }>(
            "insert into users (status, created_at, updated_at) values ('active', $1, $1) returning id",
            [verifiedAt],
          );
          const createdUserId = user.rows[0]?.id;
          if (!createdUserId) throw new Error("The learner account could not be created.");
          userId = createdUserId;
          await insertIdentity(client, userId, identity, verifiedAt, false);
          await client.query(
            "insert into learner_profiles (user_id, created_at, updated_at) values ($1, $2, $2)",
            [userId, verifiedAt],
          );
        }

        await client.query(
          "update auth_challenges set consumed_at = $2, attempts_remaining = 0 where id = $1",
          [challengeId, verifiedAt],
        );

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

        const learner = await loadLearner(client, userId);
        await client.query("commit");
        return { sessionToken, sessionExpiresAt, learner };
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    startEmailSignIn: async ({ email, requestFingerprint }) => {
      const challenge = await service.startSignIn({ identity: email, requestFingerprint });
      if (challenge.channel !== "email") {
        throw new Error("Email sign-in resolved to an unexpected identity type.");
      }
      return { challengeId: challenge.challengeId, expiresAt: challenge.expiresAt };
    },

    verifyEmailSignIn: async (input) => service.verifySignIn(input),

    listIdentities: async (userId) => identityViews(options.pool, userId),

    startIdentityLink: async ({ userId, identity, requestFingerprint }) => {
      const normalized = normalizeAuthIdentity(identity);
      const owner = await identityOwner(options.pool, normalized);
      if (owner && owner.userId !== userId) {
        throw new AuthRequestError(409, "That sign-in identity cannot be linked to this account.");
      }
      if (owner?.userId === userId) {
        throw new AuthRequestError(409, "That sign-in identity is already verified on this account.");
      }

      return createChallenge({
        identity: normalized,
        purpose: "link_identity",
        userId,
        requestFingerprint,
      });
    },

    verifyIdentityLink: async ({ userId, challengeId, code }) => {
      const verifiedAt = now();
      const client = await options.pool.connect();
      try {
        await client.query("begin");
        const { identity } = await readChallenge(client, {
          challengeId,
          code,
          purpose: "link_identity",
          userId,
        });

        await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
          `${identity.type}:${identity.normalized}`,
        ]);

        const owner = await identityOwner(client, identity);
        if (owner && owner.userId !== userId) {
          throw new AuthRequestError(409, "That sign-in identity cannot be linked to this account.");
        }

        await insertIdentity(client, userId, identity, verifiedAt, true);
        await client.query(
          "update auth_challenges set consumed_at = $2, attempts_remaining = 0 where id = $1",
          [challengeId, verifiedAt],
        );
        const identities = await identityViews(client, userId);
        await client.query("commit");
        return identities;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    removeIdentity: async ({ userId, type }) => {
      const client = await options.pool.connect();
      try {
        await client.query("begin");
        const counts = await client.query<{ email_count: number; phone_count: number }>(
          `select
             (select count(*)::int from user_email_identities where user_id = $1) as email_count,
             (select count(*)::int from user_phone_identities where user_id = $1) as phone_count`,
          [userId],
        );
        const count = (counts.rows[0]?.email_count ?? 0) + (counts.rows[0]?.phone_count ?? 0);
        if (count <= 1) {
          throw new AuthRequestError(400, "Add another verified sign-in method before removing this one.");
        }

        const deleted =
          type === "email"
            ? await client.query("delete from user_email_identities where user_id = $1", [userId])
            : await client.query("delete from user_phone_identities where user_id = $1", [userId]);
        if (deleted.rowCount !== 1) {
          throw new AuthRequestError(404, "That sign-in method is not attached to this account.");
        }

        const identities = await identityViews(client, userId);
        await client.query("commit");
        return identities;
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
        `select s.id as session_id, s.expires_at, u.id as user_id,
                e.email_display, ph.phone_display,
                p.display_name, p.locale, p.age_band, p.avatar_key, p.learning_goal, p.onboarding_status
           from auth_sessions s
           join users u on u.id = s.user_id
           join learner_profiles p on p.user_id = u.id
           left join user_email_identities e on e.user_id = u.id
           left join user_phone_identities ph on ph.user_id = u.id
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
            set last_seen_at = $2::timestamptz, idle_expires_at = least(expires_at, $3::timestamptz)
          where id = $1 and last_seen_at < $2::timestamptz - interval '5 minutes'`,
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
      const currentLearner = await loadLearner(options.pool, userId);
      const existing = currentLearner.profile;

      const merged = {
        displayName: patch.displayName === undefined ? existing.displayName : patch.displayName,
        locale: patch.locale ?? existing.locale,
        ageBand: patch.ageBand ?? existing.ageBand,
        avatarKey: patch.avatarKey === undefined ? existing.avatarKey : patch.avatarKey,
        learningGoal: patch.learningGoal === undefined ? existing.learningGoal : patch.learningGoal,
        onboardingStatus: patch.onboardingStatus ?? existing.onboardingStatus,
      };

      await options.pool.query(
        `update learner_profiles
            set display_name = $2, locale = $3, age_band = $4, avatar_key = $5,
                learning_goal = $6, onboarding_status = $7, updated_at = $8
          where user_id = $1`,
        [
          userId,
          merged.displayName,
          merged.locale,
          merged.ageBand,
          merged.avatarKey,
          merged.learningGoal,
          merged.onboardingStatus,
          updatedAt,
        ],
      );
      return loadLearner(options.pool, userId);
    },
  };

  return service;
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
  app.post("/v1/auth/otp/start", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const body = StartOtpSchema.parse(request.body);
    const challenge = await options.authService.startSignIn({
      identity: body.identity,
      requestFingerprint: requestFingerprint(request),
    });
    return reply.status(202).send({
      challengeId: challenge.challengeId,
      channel: challenge.channel,
      maskedDestination: challenge.maskedDestination,
      expiresAt: challenge.expiresAt.toISOString(),
      message: "If delivery is available, a sign-in code has been sent.",
    });
  });

  app.post("/v1/auth/otp/verify", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const verified = await options.authService.verifySignIn(VerifyOtpSchema.parse(request.body));
    reply.header("set-cookie", sessionCookie(options.config, verified.sessionToken, verified.sessionExpiresAt));
    return reply.status(200).send({ learner: verified.learner });
  });

  // Backward-compatible email-only endpoints remain available while clients migrate.
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
    const verified = await options.authService.verifyEmailSignIn(VerifyOtpSchema.parse(request.body));
    reply.header("set-cookie", sessionCookie(options.config, verified.sessionToken, verified.sessionExpiresAt));
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

  app.get("/v1/account/identities", async (request) => {
    const { learner } = await requireLearner(request, options.config, options.authService);
    return { identities: await options.authService.listIdentities(learner.id) };
  });

  app.post("/v1/account/identities/start", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const { learner } = await requireLearner(request, options.config, options.authService);
    const body = StartOtpSchema.parse(request.body);
    const challenge = await options.authService.startIdentityLink({
      userId: learner.id,
      identity: body.identity,
      requestFingerprint: requestFingerprint(request),
    });
    return reply.status(202).send({
      challengeId: challenge.challengeId,
      channel: challenge.channel,
      maskedDestination: challenge.maskedDestination,
      expiresAt: challenge.expiresAt.toISOString(),
    });
  });

  app.post("/v1/account/identities/verify", async (request) => {
    requireTrustedOrigin(request, options.config);
    const { learner } = await requireLearner(request, options.config, options.authService);
    const body = VerifyOtpSchema.parse(request.body);
    return {
      identities: await options.authService.verifyIdentityLink({
        userId: learner.id,
        challengeId: body.challengeId,
        code: body.code,
      }),
    };
  });

  app.delete("/v1/account/identities/:type", async (request) => {
    requireTrustedOrigin(request, options.config);
    const { learner } = await requireLearner(request, options.config, options.authService);
    const params = IdentityTypeParamsSchema.parse(request.params);
    return {
      identities: await options.authService.removeIdentity({
        userId: learner.id,
        type: params.type,
      }),
    };
  });

  app.patch("/v1/profile", async (request) => {
    requireTrustedOrigin(request, options.config);
    const { learner } = await requireLearner(request, options.config, options.authService);
    const patch = UpdateProfileSchema.parse(request.body);
    return { learner: await options.authService.updateProfile(learner.id, patch) };
  });
}
