/**
 * Staging-host read-only certificate history audit.
 * Runs inside the API container against /app/dist + DATABASE_URL from env_file.
 * Never issues awards. Forbidden outside APP_ENV=staging|test|ci.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

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

const require = createRequire("/app/package.json");
const { Pool } = require("pg");

const certificates = await import(pathToFileURL("/app/dist/certificates.js").href);
const auditCore = await import(
  pathToFileURL("/tmp/aifs-audit/tools/aifs-certificate-history-audit-core.mjs").href
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  allowExitOnIdle: true,
});
const client = await pool.connect();
try {
  await client.query("begin transaction isolation level repeatable read read only");
  const service = certificates.createCertificateService({
    pool: { query: (...args) => client.query(...args) },
    issuanceEnabled: false,
  });
  const report = await auditCore.auditCertificateHistory(client, service, {
    limit: auditCore.historyLimit(process.env.AIFS_CERTIFICATE_HISTORY_LIMIT),
  });
  console.info(
    JSON.stringify({
      ...report,
      appEnv,
      note:
        "No learner-identifying data printed. No awards issued or changed. Human approval required for any historical backfill. " +
        report.note,
    }),
  );
  await client.query("rollback");
  if (report.certificationStatus !== "AUDITED_NO_WRITES") {
    throw new Error(
      "History audit cannot certify zero approved policies, incomplete scans or frozen-award anomalies; see aggregate report.",
    );
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
