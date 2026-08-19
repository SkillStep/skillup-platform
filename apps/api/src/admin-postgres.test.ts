import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createAdminService } from "./admin-service.js";
import { createAdminService as createExpandedAdminService } from "./admin-service-v2.js";

const databaseUrl = process.env["DATABASE_URL"];
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true })
  : null;

afterAll(async () => {
  await pool?.end();
});

describeWithPostgres("Admin read models against PostgreSQL", () => {
  it("loads learner support and metrics using the migrated schema", async () => {
    if (!pool) throw new Error("DATABASE_URL is required for the PostgreSQL Admin regression.");

    const userId = randomUUID();
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

    const admin = createAdminService({ pool, releaseSha: "admin-postgres-regression" });
    try {
      const support = await admin.supportLearner(userId);
      const learner = support["learner"] as Record<string, unknown>;
      expect(learner["id"]).toBe(userId);
      expect(Number(learner["pointsEarned"] ?? 0)).toBe(0);
      expect(Number(learner["gameplaySessions"] ?? 0)).toBe(0);

      const metrics = await admin.metrics();
      expect(Number(metrics["activeLearners"] ?? 0)).toBeGreaterThanOrEqual(1);
      expect(Number(metrics["completedSessions"] ?? 0)).toBeGreaterThanOrEqual(0);
    } finally {
      await pool.query("delete from users where id = $1", [userId]);
    }
  });

  it("loads expanded metrics and converts stored AI microusd to USD", async () => {
    if (!pool) throw new Error("DATABASE_URL is required for the PostgreSQL Admin regression.");

    const userId = randomUUID();
    const now = new Date();
    const correlationId = randomUUID();
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

    const admin = createExpandedAdminService({
      pool,
      releaseSha: "admin-v2-postgres-regression",
    });
    let requestId: string | null = null;
    try {
      const request = await admin.createGenerationRequest(
        { userId, roles: ["analyst"], capabilities: ["metrics.read"] },
        {
          task: "summarize_content",
          targetType: "qa_fixture",
          locale: "en",
          promptVersion: "admin-v2-regression",
          requestedItems: 1,
          inputPayload: { text: "schema regression" },
        },
        correlationId,
      );
      requestId = request.id;

      await pool.query(
        `insert into ai_job_attempts
          (request_id, attempt_number, provider, model, status, started_at, completed_at,
           input_digest, output_digest, validation_report, quality_score,
           input_tokens, output_tokens, estimated_cost_microusd)
         values ($1, 1, 'test', 'test-model', 'completed', $2, $2,
                 $3, $3, '{}'::jsonb, 100, 1, 1, 123456)`,
        [requestId, now, "a".repeat(64)],
      );

      const metrics = await admin.metrics();
      expect(Number(metrics["estimatedAiCostUsd"] ?? 0)).toBeGreaterThanOrEqual(0.123456);
      expect(Number(metrics["completedAiJobs"] ?? 0)).toBeGreaterThanOrEqual(0);
    } finally {
      if (requestId) {
        await pool.query("delete from ai_job_attempts where request_id = $1", [requestId]);
        await pool.query("delete from ai_generation_requests where id = $1", [requestId]);
      }
      await pool.query("delete from privileged_audit_events where actor_user_id = $1", [userId]);
      await pool.query("delete from users where id = $1", [userId]);
    }
  });
});
