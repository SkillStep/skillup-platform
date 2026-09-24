import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AuthCodeDelivery, AuthService } from "./auth.js";
import type { ApiConfig } from "./config.js";
import { maskIdentity, parseSignInIdentity } from "./identity.js";
import type { SmsCodeDelivery } from "./sms-delivery.js";

const StartIdentityLinkSchema = z.object({
  identity: z.string().trim().min(3).max(254),
});

const VerifyIdentityLinkSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{4}$/),
  channel: z.enum(["email", "sms"]),
});

const RemoveIdentityParamsSchema = z.object({
  channel: z.enum(["email", "sms"]),
});

class IdentityManagementError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "IdentityManagementError";
    this.statusCode = statusCode;
  }
}

function digest(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function digestsMatch(leftHex: string, rightHex: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(leftHex) || !/^[a-f0-9]{64}$/.test(rightHex)) return false;
  return timingSafeEqual(Buffer.from(leftHex, "hex"), Buffer.from(rightHex, "hex"));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function requestFingerprint(request: FastifyRequest): string {
  const userAgent = request.headers["user-agent"] ?? "unknown";
  return `${request.ip}|${userAgent}`;
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
    throw new IdentityManagementError(403, "The request origin is not allowed.");
  }
}

async function requireUserId(
  request: FastifyRequest,
  config: ApiConfig,
  authService: AuthService,
): Promise<string> {
  const token = parseCookie(request.headers.cookie, config.SESSION_COOKIE_NAME);
  if (!token) throw new IdentityManagementError(401, "Authentication is required.");
  const learner = await authService.resolveSession(token);
  if (!learner) throw new IdentityManagementError(401, "The session is invalid or expired.");
  return learner.id;
}

export type IdentityManagementService = ReturnType<typeof createIdentityManagementService>;

export function createIdentityManagementService(options: Readonly<{
  pool: DatabaseClient["pool"];
  secret: string;
  challengeMinutes: number;
  emailDelivery: AuthCodeDelivery;
  smsDelivery: SmsCodeDelivery;
  now?: () => Date;
  createCode?: () => string;
}>) {
  const now = options.now ?? (() => new Date());
  const createCode = options.createCode ?? (() => randomInt(0, 10_000).toString().padStart(4, "0"));

  async function list(userId: string) {
    const [email, phone] = await Promise.all([
      options.pool.query<{ email_display: string; verified_at: Date }>(
        "select email_display, verified_at from user_email_identities where user_id = $1",
        [userId],
      ),
      options.pool.query<{ phone_display: string; verified_at: Date }>(
        "select phone_display, verified_at from user_phone_identities where user_id = $1",
        [userId],
      ),
    ]);
    return {
      email: email.rows[0]
        ? { value: email.rows[0].email_display, verifiedAt: email.rows[0].verified_at.toISOString() }
        : null,
      phone: phone.rows[0]
        ? { value: phone.rows[0].phone_display, verifiedAt: phone.rows[0].verified_at.toISOString() }
        : null,
    };
  }

  async function start(userId: string, rawIdentity: string, fingerprint: string) {
    const identity = parseSignInIdentity(rawIdentity);
    const existing =
      identity.channel === "email"
        ? await options.pool.query<{ user_id: string }>(
            "select user_id from user_email_identities where email_normalized = $1",
            [identity.normalized],
          )
        : await options.pool.query<{ user_id: string }>(
            "select user_id from user_phone_identities where phone_normalized = $1",
            [identity.normalized],
          );
    const owner = existing.rows[0]?.user_id;
    if (owner === userId) throw new IdentityManagementError(409, "That sign-in identity is already linked.");
    if (owner) throw new IdentityManagementError(409, "That sign-in identity is already in use.");

    const requestedAt = now();
    const fingerprintDigest = digest(options.secret, `fingerprint:${fingerprint}`);
    const cutoff = addMinutes(requestedAt, -15);
    const limits = await options.pool.query<{
      identity_count: string;
      fingerprint_count: string;
      last_created_at: Date | null;
    }>(
      `select
        (select count(*) from auth_challenges
          where purpose = 'identity_link' and identity_type = $1 and email_normalized = $2 and created_at >= $3) as identity_count,
        (select count(*) from auth_challenges
          where purpose = 'identity_link' and request_fingerprint_digest = $4 and created_at >= $3) as fingerprint_count,
        (select max(created_at) from auth_challenges
          where purpose = 'identity_link' and identity_type = $1 and email_normalized = $2) as last_created_at`,
      [identity.channel === "email" ? "email" : "phone", identity.normalized, cutoff, fingerprintDigest],
    );
    if (
      limits.rows[0]?.last_created_at &&
      requestedAt.getTime() - limits.rows[0].last_created_at.getTime() < 60_000
    ) {
      throw new IdentityManagementError(
        429,
        "Please wait 60 seconds before requesting another verification code.",
      );
    }
    if (
      Number(limits.rows[0]?.identity_count ?? 0) >= 5 ||
      Number(limits.rows[0]?.fingerprint_count ?? 0) >= 20
    ) {
      throw new IdentityManagementError(429, "Please wait before requesting another verification code.");
    }

    const challengeId = randomUUID();
    const code = createCode();
    const expiresAt = addMinutes(requestedAt, options.challengeMinutes);
    const secretDigest = digest(options.secret, `challenge:${challengeId}:${code}`);

    if (identity.channel === "email") {
      await options.emailDelivery.sendSignInCode({ email: identity.normalized, code, expiresAt });
    } else {
      await options.smsDelivery.sendSignInCode({ phone: identity.normalized, code, expiresAt });
    }

    await options.pool.query(
      `insert into auth_challenges
        (id, email_normalized, identity_type, purpose, secret_digest, request_fingerprint_digest,
         attempts_remaining, expires_at, created_at)
       values ($1, $2, $3, 'identity_link', $4, $5, 5, $6, $7)`,
      [
        challengeId,
        identity.normalized,
        identity.channel === "email" ? "email" : "phone",
        secretDigest,
        fingerprintDigest,
        expiresAt,
        requestedAt,
      ],
    );

    return {
      challengeId,
      channel: identity.channel,
      maskedDestination: maskIdentity(identity),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async function verify(userId: string, challengeId: string, channel: "email" | "sms", code: string) {
    const verifiedAt = now();
    const database = await options.pool.connect();
    try {
      await database.query("begin");
      const identityType = channel === "email" ? "email" : "phone";
      const result = await database.query<{
        email_normalized: string;
        secret_digest: string;
        attempts_remaining: number;
        expires_at: Date;
        consumed_at: Date | null;
      }>(
        `select email_normalized, secret_digest, attempts_remaining, expires_at, consumed_at
           from auth_challenges
          where id = $1 and purpose = 'identity_link' and identity_type = $2
          for update`,
        [challengeId, identityType],
      );
      const challenge = result.rows[0];
      const invalid =
        !challenge ||
        challenge.consumed_at !== null ||
        challenge.attempts_remaining <= 0 ||
        challenge.expires_at.getTime() <= verifiedAt.getTime();
      const presentedDigest = digest(options.secret, `challenge:${challengeId}:${code}`);
      if (invalid || !digestsMatch(challenge.secret_digest, presentedDigest)) {
        if (challenge && challenge.consumed_at === null && challenge.attempts_remaining > 0) {
          await database.query(
            "update auth_challenges set attempts_remaining = greatest(attempts_remaining - 1, 0) where id = $1",
            [challengeId],
          );
        }
        await database.query("commit");
        throw new IdentityManagementError(400, "The verification code is invalid or expired.");
      }

      const owner =
        identityType === "email"
          ? await database.query<{ user_id: string }>(
              "select user_id from user_email_identities where email_normalized = $1 for update",
              [challenge.email_normalized],
            )
          : await database.query<{ user_id: string }>(
              "select user_id from user_phone_identities where phone_normalized = $1 for update",
              [challenge.email_normalized],
            );
      if (owner.rows[0]?.user_id && owner.rows[0].user_id !== userId) {
        throw new IdentityManagementError(409, "That sign-in identity is already in use.");
      }

      if (identityType === "email") {
        await database.query(
          `insert into user_email_identities
            (user_id, email_normalized, email_display, verified_at, created_at, updated_at)
           values ($1, $2, $2, $3, $3, $3)
           on conflict (user_id) do update
             set email_normalized = excluded.email_normalized,
                 email_display = excluded.email_display,
                 verified_at = excluded.verified_at,
                 updated_at = excluded.updated_at`,
          [userId, challenge.email_normalized, verifiedAt],
        );
      } else {
        const identity = parseSignInIdentity(challenge.email_normalized);
        if (identity.channel !== "sms") throw new IdentityManagementError(400, "Invalid phone identity.");
        await database.query(
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
      }

      await database.query(
        "update auth_challenges set consumed_at = $2, attempts_remaining = 0 where id = $1",
        [challengeId, verifiedAt],
      );
      await database.query("commit");
      return list(userId);
    } catch (error) {
      await database.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      database.release();
    }
  }

  async function remove(userId: string, channel: "email" | "sms") {
    const identities = await list(userId);
    const count = Number(Boolean(identities.email)) + Number(Boolean(identities.phone));
    if (count <= 1) {
      throw new IdentityManagementError(409, "Add another verified sign-in method before removing this one.");
    }
    if (channel === "email") {
      await options.pool.query("delete from user_email_identities where user_id = $1", [userId]);
    } else {
      await options.pool.query("delete from user_phone_identities where user_id = $1", [userId]);
    }
    return list(userId);
  }

  return { list, start, verify, remove } as const;
}

export function registerIdentityManagementRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    service: IdentityManagementService;
  }>,
): void {
  app.get("/v1/account/identities", async (request) => {
    const userId = await requireUserId(request, options.config, options.authService);
    return options.service.list(userId);
  });

  app.post("/v1/account/identities/otp/start", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const userId = await requireUserId(request, options.config, options.authService);
    const body = StartIdentityLinkSchema.parse(request.body);
    return reply.status(202).send(
      await options.service.start(userId, body.identity, requestFingerprint(request)),
    );
  });

  app.post("/v1/account/identities/otp/verify", async (request) => {
    requireTrustedOrigin(request, options.config);
    const userId = await requireUserId(request, options.config, options.authService);
    const body = VerifyIdentityLinkSchema.parse(request.body);
    return options.service.verify(userId, body.challengeId, body.channel, body.code);
  });

  app.delete("/v1/account/identities/:channel", async (request) => {
    requireTrustedOrigin(request, options.config);
    const userId = await requireUserId(request, options.config, options.authService);
    const { channel } = RemoveIdentityParamsSchema.parse(request.params);
    return options.service.remove(userId, channel);
  });
}
