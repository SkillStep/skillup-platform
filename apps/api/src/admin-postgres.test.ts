import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createAdminService } from "./admin-service-v2.js";

const databaseUrl = process.env["DATABASE_URL"];
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true })
  : null;

afterAll(async () => {
  await pool?.end();
});

describeWithPostgres("Admin read models against PostgreSQL", () => {
  it("loads learner support and expanded metrics using the migrated schema", async () => {
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
      expect(Number(metrics["estimatedAiCostUsd"] ?? 0)).toBeGreaterThanOrEqual(0);
    } finally {
      await pool.query("delete from users where id = $1", [userId]);
    }
  });
});
