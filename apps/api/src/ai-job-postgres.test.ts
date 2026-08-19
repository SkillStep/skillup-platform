import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createAdminService } from "./admin-service-v2.js";
import { createAiJobService } from "./ai-job-service.js";

const databaseUrl = process.env["DATABASE_URL"];
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true })
  : null;

afterAll(async () => {
  await pool?.end();
});

describeWithPostgres("AI job queue against PostgreSQL", () => {
  it("claims a queued generation request against the fully migrated schema", async () => {
    if (!pool) throw new Error("DATABASE_URL is required for the PostgreSQL AI queue regression.");

    const userId = randomUUID();
    const correlationId = randomUUID();
    const now = new Date();
    await pool.query(
      `insert into users (id, status, created_at, updated_at)
       values ($1, 'active', $2::timestamptz, $2::timestamptz)`,
      [userId, now],
    );
    await pool.query(
      `insert into learner_profiles
        (user_id, locale, age_band, onboarding_status, created_at, updated_at)
       values ($1, 'en', '18_24', 'completed', $2::timestamptz, $2::timestamptz)`,
      [userId, now],
    );

    const admin = createAdminService({ pool, releaseSha: "ai-job-postgres-regression" });
    const queue = createAiJobService({ pool });
    let requestId: string | null = null;
    try {
      const request = await admin.createGenerationRequest(
        {
          userId,
          roles: ["content_editor"],
          capabilities: ["ai.request"],
        },
        {
          task: "summarize_content",
          targetType: "qa_fixture",
          locale: "en",
          promptVersion: "ai-job-postgres-regression",
          requestedItems: 1,
          inputPayload: { text: "Claim this request from the migrated PostgreSQL queue." },
        },
        correlationId,
      );
      requestId = request.id;

      const claimed = await queue.claim({ workerId: "postgres-regression-worker", leaseSeconds: 120 });
      expect(claimed?.["requestId"]).toBe(requestId);
      expect(claimed?.["attemptNumber"]).toBe(1);
      expect(claimed?.["leaseToken"]).toEqual(expect.any(String));
      expect((claimed?.["job"] as Record<string, unknown> | undefined)?.["task"]).toBe("summarize");

      const persisted = await pool.query<{
        status: string;
        attempt_count: number;
        lease_token: string | null;
        lease_expires_at: Date | null;
      }>(
        `select status, attempt_count, lease_token, lease_expires_at
           from ai_generation_requests where id = $1`,
        [requestId],
      );
      expect(persisted.rows[0]?.status).toBe("running");
      expect(persisted.rows[0]?.attempt_count).toBe(1);
      expect(persisted.rows[0]?.lease_token).toEqual(expect.any(String));
      expect(persisted.rows[0]?.lease_expires_at).toBeInstanceOf(Date);
    } finally {
      if (requestId) {
        await pool.query("delete from ai_generation_requests where id = $1", [requestId]);
      }
      await pool.query("delete from privileged_audit_events where actor_user_id = $1", [userId]);
      await pool.query("delete from users where id = $1", [userId]);
    }
  });
});
