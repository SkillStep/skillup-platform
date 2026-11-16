import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = new URL("./aifs-certificate-backfill-dry-run.mjs", import.meta.url);
const source = readFileSync(script, "utf8");

function audit(env) {
  return spawnSync(process.execPath, ["--import", "tsx", script.pathname], {
    env: {
      ...process.env,
      APP_ENV: "test",
      AIFS_CERTIFICATE_BACKFILL_DRY_RUN: "yes",
      DATABASE_URL: "",
      ...env,
    },
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("certificate backfill always requires a nonproduction environment", () => {
  const result = audit({ APP_ENV: "production" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only for test or staging/);
});

test("certificate backfill requires explicit dry-run authorization", () => {
  const result = audit({ AIFS_CERTIFICATE_BACKFILL_DRY_RUN: "no" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Explicit AIFS_CERTIFICATE_BACKFILL_DRY_RUN=yes/);
});

test("certificate audit never connects to implicit or missing database", () => {
  const result = audit({ DATABASE_URL: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_URL must be configured/);
});

test("all audited queries run within a read-only transaction and issuance stays disabled", () => {
  assert.match(source, /begin transaction isolation level repeatable read read only/);
  assert.match(source, /issuanceEnabled: false/);
  assert.doesNotMatch(source, /\b(?:insert|update|delete)\s+into\s+skill_certificate_awards\b/i);
  assert.match(source, /No learner-identifying data printed/);
});
