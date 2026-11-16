/**
 * Read-only historic certificate eligibility audit.
 * Never inserts or issues; deliberately disallowed in production.
 * It never emits learner IDs, names, phone numbers, emails or answer keys.
 */
import { createRequire } from "node:module";
import { createCertificateService } from "../apps/api/src/certificates.ts";

const appEnv = process.env.APP_ENV;
if (!["test", "staging"].includes(appEnv ?? "")) {
  throw new Error("Certificate backfill audit is permitted only for test or staging.");
}
if (process.env.AIFS_CERTIFICATE_BACKFILL_DRY_RUN !== "yes") {
  throw new Error("Explicit AIFS_CERTIFICATE_BACKFILL_DRY_RUN=yes authorization is required.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("The staging/test DATABASE_URL must be configured.");
}

const requireDatabase = createRequire(
  new URL("../packages/database/package.json", import.meta.url),
);
const { Pool } = requireDatabase("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  allowExitOnIdle: true,
});
const client = await pool.connect();
const limit = 500;

try {
  await client.query("begin transaction isolation level repeatable read read only");
  const service = createCertificateService({
    pool: { query: (...args) => client.query(...args) },
    issuanceEnabled: false,
  });

  const policies = await client.query(
    `select s.slug, r.id, r.level_version_ids
       from skill_completion_requirement_sets r
       join skills s on s.id = r.skill_id and s.status = 'published'
       join skill_versions sv on sv.id = r.skill_version_id
         and sv.skill_id = r.skill_id
         and sv.status = 'published'
         and sv.reviewed_at is not null and sv.published_at is not null
      where r.status = 'active' and r.approved_by is not null
        and r.approved_at is not null
      order by s.slug`,
  );

  const report = [];
  for (const item of policies.rows) {
    const possible = await client.query(
      `select distinct l.user_id
         from level_play_sessions l
         join users u on u.id = l.user_id and u.status = 'active'
        where l.level_version_id = any($1::uuid[]) and l.state = 'completed'
        limit $2`,
      [item.level_version_ids, limit + 1],
    );
    const truncated = possible.rows.length > limit;
    let eligible = 0;
    let earned = 0;
    let incomplete = 0;
    for (const row of possible.rows.slice(0, limit)) {
      const e = await service.eligibility(row.user_id, item.slug);
      if (e.status === "eligible") eligible++;
      if (e.status === "earned") earned++;
      if (e.status !== "eligible" && e.status !== "earned") incomplete++;
    }
    report.push({
      skillSlug: item.slug,
      examinedCandidates: Math.min(possible.rows.length, limit),
      eligibleButNotIssued: eligible,
      alreadyIssued: earned,
      incomplete,
      candidateLimitHit: truncated,
    });
  }
  console.info(
    JSON.stringify({
      mode: "DRY_RUN_NO_WRITES",
      appEnv,
      policyCount: policies.rows.length,
      sampleCapPerSkill: limit,
      results: report,
      note: "No awards issued or changed. No learner-identifying data printed. Human policy and backfill authorization required before any writes.",
    }),
  );
  await client.query("rollback");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
