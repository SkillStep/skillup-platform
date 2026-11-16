/**
 * Privacy-safe historical certificate verification. Strictly read-only.
 * Does not issue or update an award; deliberately disallowed in production.
 */
import { createRequire } from "node:module";

import { createCertificateService } from "../apps/api/src/certificates.ts";
import { auditCertificateHistory, historyLimit } from "./aifs-certificate-history-audit-core.mjs";

const appEnv = process.env.APP_ENV;
if (!["test", "ci", "staging"].includes(appEnv ?? "")) {
  throw new Error("Certificate backfill audit is permitted only for test or staging.");
}
if (process.env.AIFS_CERTIFICATE_BACKFILL_DRY_RUN !== "yes") {
  throw new Error("Explicit AIFS_CERTIFICATE_BACKFILL_DRY_RUN=yes authorization is required.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("The staging/test DATABASE_URL must be configured.");
}

const requireDatabase = createRequire(new URL("../packages/database/package.json", import.meta.url));
const { Pool } = requireDatabase("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  allowExitOnIdle: true,
});
const client = await pool.connect();
try {
  await client.query("begin transaction isolation level repeatable read read only");
  const service = createCertificateService({
    pool: { query: (...args) => client.query(...args) },
    issuanceEnabled: false,
  });
  const report = await auditCertificateHistory(client, service, {
    limit: historyLimit(process.env.AIFS_CERTIFICATE_HISTORY_LIMIT),
  });
  console.info(JSON.stringify({
    ...report,
    appEnv,
    note: "No learner-identifying data printed. No awards issued or changed. Human approval required for any historical backfill. " + report.note,
  }));
  await client.query("rollback");
  if (!report.fullCoverageProven || report.frozenAwardEvidenceAnomalies > 0) {
    throw new Error("History audit is incomplete or found frozen-award anomalies; see aggregate report.");
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
