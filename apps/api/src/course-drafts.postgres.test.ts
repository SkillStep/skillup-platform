import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createContentOperationsService } from "./content-operations.js";

const databaseUrl = process.env["DATABASE_URL"];
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl, max: 1, allowExitOnIdle: true })
  : null;

afterAll(async () => {
  await pool?.end();
});

describeWithPostgres("AIFS private reviewer packet PostgreSQL query", () => {
  it("compiles the draft-only joins and fails closed for an unimported course", async () => {
    if (!pool) throw new Error("DATABASE_URL is required for the reviewer SQL regression.");
    const service = createContentOperationsService({
      pool,
      adminService: {} as never,
      releaseSha: "course-review-postgres-regression",
    });
    const absentSlug = "not-imported-" + randomUUID().replaceAll("-", "");
    await expect(service.getCourseDraftReviewPacket(absentSlug)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
