import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createAuthService } from "./auth.js";

const databaseUrl = process.env["DATABASE_URL"];
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true })
  : null;

afterAll(async () => {
  await pool?.end();
});

describeWithPostgres("passwordless auth against PostgreSQL", () => {
  it("creates a first-time learner session without ambiguous timestamp parameters", async () => {
    if (!pool) throw new Error("DATABASE_URL is required for the PostgreSQL auth regression.");

    const email = `auth-regression-${randomUUID()}@example.test`;
    const now = new Date();
    const code = "1234";
    let deliveredCode = "";
    let userId: string | null = null;

    const auth = createAuthService({
      pool,
      secret: "ci-auth-regression-secret-at-least-32-bytes",
      challengeMinutes: 10,
      sessionIdleMinutes: 60,
      sessionAbsoluteHours: 168,
      now: () => now,
      createCode: () => code,
      delivery: {
        sendSignInCode: async (message) => {
          deliveredCode = message.code;
        },
      },
    });

    try {
      const challenge = await auth.startEmailSignIn({
        email,
        requestFingerprint: `auth-regression-${randomUUID()}`,
      });
      expect(deliveredCode).toBe(code);

      const verified = await auth.verifyEmailSignIn({
        challengeId: challenge.challengeId,
        code,
      });
      userId = verified.learner.id;
      expect(verified.learner.email).toBe(email);

      const resolved = await auth.resolveSession(verified.sessionToken);
      expect(resolved?.id).toBe(userId);
      expect(resolved?.email).toBe(email);
    } finally {
      if (userId) await pool.query("delete from users where id = $1", [userId]);
      await pool.query("delete from auth_challenges where email_normalized = $1", [email]);
    }
  });
});
