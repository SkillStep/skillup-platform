import assert from "node:assert/strict";
import test from "node:test";

import {
  auditCertificateHistory,
  HISTORY_DEFAULT_LIMIT,
  historyLimit,
} from "./aifs-certificate-history-audit-core.mjs";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
];

function harness({ total = 3, awardAnomalies = 0, policies = 1 } = {}) {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("from skill_completion_requirement_sets r") && sql.includes("order by s.slug")) {
        return {
          rows: policies ? [{ slug: "interview-workplace-communication", level_version_ids: [ids[0]] }] : [],
        };
      }
      if (sql.includes("candidate_count")) {
        return { rows: [{ candidate_count: total, progress_only_count: 2 }] };
      }
      if (sql.includes("select distinct sessions.user_id")) {
        const subset = ids.slice(0, total);
        const after = params[1];
        const sliced = subset.filter((id) => after === null || id > after).slice(0, params[2]);
        return { rows: sliced.map((user_id) => ({ user_id })) };
      }
      if (sql.includes("from skill_certificate_awards a")) {
        return {
          rows: [{
            total_awards: 2,
            issued_awards: 1,
            revoked_awards: 1,
            awards_from_prior_requirement_versions: 0,
            frozen_evidence_anomalies: awardAnomalies,
          }],
        };
      }
      throw new Error("Unexpected audit query (fail closed).");
    },
  };
  const service = {
    async eligibility(userId) {
      if (userId === ids[0]) return { status: "eligible" };
      if (userId === ids[1]) return { status: "earned" };
      return { status: "incomplete" };
    },
  };
  return { client, service, queries };
}

test("complete history scan counts verified eligibility, legacy-only progress and frozen awards", async () => {
  const { client, service, queries } = harness();
  const report = await auditCertificateHistory(client, service);
  assert.equal(report.mode, "READ_ONLY_NO_AWARDS");
  assert.equal(report.fullCoverageProven, true);
  assert.equal(report.certificationStatus, "AUDITED_NO_WRITES");
  assert.equal(report.totalCandidates, 3);
  assert.equal(report.results[0].eligibleButNotIssued, 1);
  assert.equal(report.results[0].alreadyIssued, 1);
  assert.equal(report.results[0].incomplete, 1);
  assert.equal(report.results[0].legacyProgressOnly, 2);
  assert.equal(report.frozenAwards.issued, 1);
  assert.equal(report.frozenAwards.revoked, 1);
  assert.equal(report.frozenAwardEvidenceAnomalies, 0);
  assert(!JSON.stringify(report).includes(ids[0]), "No private learner IDs can enter reports.");
  assert(queries.every(({ sql }) => /^\s*select\b/i.test(sql)), "Audit must never write.");
});

test("full coverage means no silent 500-user sampling or truncated histories", async () => {
  const { client, service } = harness();
  const report = await auditCertificateHistory(client, service, { limit: 2 });
  assert.equal(report.results[0].candidateCountTotal, 3);
  assert.equal(report.results[0].examinedCandidates, 2);
  assert.equal(report.fullCoverageProven, false);
  assert.equal(report.results[0].candidateLimitHit, true);
  assert.equal(report.certificationStatus, "REVIEW_REQUIRED");
});

test("cannot certify without approved policies or with frozen award anomalies", async () => {
  const without = harness({ policies: 0 });
  const empty = await auditCertificateHistory(without.client, without.service);
  assert.equal(empty.certificationStatus, "NO_ACTIVE_POLICY_CANNOT_CERTIFY");
  const withAnomalies = harness({ awardAnomalies: 2 });
  const anomaly = await auditCertificateHistory(withAnomalies.client, withAnomalies.service);
  assert.equal(anomaly.certificationStatus, "REVIEW_REQUIRED");
  assert.equal(anomaly.frozenAwardEvidenceAnomalies, 2);
});

test("history limit validates bounded, explicit, numeric sweep", () => {
  assert.equal(historyLimit(), HISTORY_DEFAULT_LIMIT);
  assert.equal(historyLimit("100000"), 100000);
  for (const value of ["0", "5.5", "abc", "-1", "100001"]) {
    assert.throws(() => historyLimit(value));
  }
});
