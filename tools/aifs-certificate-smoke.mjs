import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { createCertificateService } from "../apps/api/src/certificates.ts";
import { CANONICAL_SKILLS } from "./validate-aifs-certificate-policy.mjs";
import { auditCertificateHistory } from "./aifs-certificate-history-audit-core.mjs";

const requireDatabase = createRequire(
  new URL("../packages/database/package.json", import.meta.url),
);
const { Pool } = requireDatabase("pg");

if (process.env.APP_ENV !== "test" && process.env.APP_ENV !== "ci") {
  throw new Error("Certificate smoke may only run in an isolated test/CI PostgreSQL.");
}
if (!process.env.DATABASE_URL) throw new Error("An explicit test DATABASE_URL is required.");

const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  allowExitOnIdle: true,
});
const db = await pool.connect();
const learnerId = randomUUID();
const reviewerId = randomUUID();
const reason = "Test-only independent product-policy approval, rolled back after CI verification.";

const scopedConnection = {
  query(sql, values) {
    if (sql === "begin") return db.query("savepoint certificate_engine");
    if (sql === "commit") return db.query("release savepoint certificate_engine");
    if (sql === "rollback") return db.query("rollback to savepoint certificate_engine");
    return db.query(sql, values);
  },
  release() {},
};
const scopedPool = {
  connect: async () => scopedConnection,
  query: (...args) => db.query(...args),
};
const disabled = createCertificateService({ pool: scopedPool, issuanceEnabled: false });
const enabled = createCertificateService({ pool: scopedPool, issuanceEnabled: true });
const fakeLearner = {
  id: learnerId,
  email: null,
  phone: null,
  profile: {
    displayName: "Test-only Learner",
    locale: "en",
    ageBand: "18_24",
    avatarKey: null,
    learningGoal: null,
    onboardingStatus: "completed",
  },
};

async function mustRejectInSavepoint(fn, pattern) {
  await db.query("savepoint expected_rejection");
  await assert.rejects(fn, pattern);
  await db.query("rollback to savepoint expected_rejection");
  await db.query("release savepoint expected_rejection");
}

try {
  await db.query("begin");
  const initial = await db.query("select count(*)::int as n from skill_certificate_awards");
  assert.equal(initial.rows[0].n, 0, "Migration must not automatically issue certificates.");

  await db.query("insert into users(id,status) values ($1,'active'),($2,'active')", [
    learnerId,
    reviewerId,
  ]);
  const root = await db.query(
    `select s.id as skill_id, s.slug, sv.id as version_id
       from skills s join skill_versions sv on sv.skill_id = s.id
      where s.status = 'published' and sv.status = 'published'
        and sv.locale = s.default_locale limit 1`,
  );
  const skill = root.rows[0];
  assert(skill, "The seed must contain a published original course.");

  const lv = await db.query(
    `select v.id as version_id, v.level_id
       from level_versions v
       join levels l on l.id = v.level_id
       join lessons les on les.id = l.lesson_id
       join learning_modules m on m.id = les.module_id
       join learning_paths p on p.id = m.learning_path_id
      where p.skill_id = $1 and v.state = 'published'
      order by v.id`,
    [skill.skill_id],
  );
  assert(lv.rows.length > 0);
  const versions = lv.rows.map((row) => row.version_id);
  const cv = await db.query(
    `select id as version_id, challenge_id, level_version_id, points
       from challenge_versions
      where level_version_id = any($1::uuid[]) and state = 'published'
      order by level_version_id, id`,
    [versions],
  );
  assert(cv.rows.length >= lv.rows.length);
  const challengeIds = cv.rows.map((row) => row.version_id);

  await mustRejectInSavepoint(
    () =>
      db.query(
        `insert into skill_completion_requirement_sets
           (skill_id,skill_version_id,requirement_version,level_version_ids,
            challenge_version_ids,content_digest,status)
           values ($1,$2,1,$3::uuid[],$4::uuid[],$5,'active')`,
        [skill.skill_id, skill.version_id, versions, challengeIds, hash("policy")],
      ),
    /certificate_policy_activation_evidence/,
  );

  const approved = await db.query(
    `insert into skill_completion_requirement_sets
       (skill_id,skill_version_id,requirement_version,level_version_ids,
        challenge_version_ids,content_digest,minimum_pass_percent,
        required_capstone,retries_allowed,status,approved_by,approved_at,approval_reason)
       values ($1,$2,1,$3::uuid[],$4::uuid[],$5,80,true,true,
               'active',$6,now(),$7)
       returning id`,
    [skill.skill_id, skill.version_id, versions, challengeIds, hash("policy"), reviewerId, reason],
  );
  const requirementId = approved.rows[0].id;
  await mustRejectInSavepoint(
    () =>
      db.query(
        "update skill_completion_requirement_sets set minimum_pass_percent = 50 where id = $1",
        [requirementId],
      ),
    /Approved completion requirements are immutable/,
  );
  await assert.rejects(
    () => disabled.issue(fakeLearner, skill.slug),
    (error) => error.statusCode === 403,
    "Default issuance must stay disabled even when a test policy is activated.",
  );
  assert.equal((await enabled.list(learnerId)).length, 0);
  assert.equal(CANONICAL_SKILLS.length, 10);
  for (const [slug] of CANONICAL_SKILLS) {
    const status = await enabled.eligibility(learnerId, slug);
    if (slug !== skill.slug) {
      assert.equal(
        status.status,
        "unavailable",
        "A passed skill cannot imply another skill passed.",
      );
    }
  }
  const unfinished = await enabled.eligibility(learnerId, skill.slug);
  assert.equal(unfinished.status, "incomplete");
  assert.equal(unfinished.completedLevels, 0);
  await assert.rejects(
    () => enabled.issue(fakeLearner, skill.slug),
    (error) => error.statusCode === 409,
    "A policy and an apparent skill alone must never issue a credential.",
  );

  // CI fixture uses genuine DB-backed level session and correct attempt records.
  // No model-generated review evidence, real users or production state is affected.
  let boundarySessionId = null;
  for (const [levelIndex, level] of lv.rows.entries()) {
    const levelChallenges = cv.rows.filter((ch) => ch.level_version_id === level.version_id);
    const sum = levelChallenges.reduce((acc, c) => acc + c.points, 0);
    assert(sum > 0);
    const session = await db.query(
      `insert into level_play_sessions
       (user_id,level_id,level_version_id,state,current_challenge_ordinal,
        awarded_points,max_points,started_at,last_activity_at,expires_at,completed_at)
       values ($1,$2,$3,'completed',$4,$5,$5,
          now() - $6::int * interval '1 day',
          now() - $6::int * interval '1 day' + interval '5 minutes',
          now() - $6::int * interval '1 day' + interval '1 hour',
          now() - $6::int * interval '1 day' + interval '5 minutes')
       returning id`,
      [learnerId, level.level_id, level.version_id, levelChallenges.length, sum, levelIndex + 1],
    );
    const sessionId = session.rows[0].id;
    if (levelIndex === 0) boundarySessionId = sessionId;
    for (const [i, challenge] of levelChallenges.entries()) {
      await db.query(
        `insert into level_session_challenges
          (session_id,ordinal,challenge_id,challenge_version_id,max_attempts,max_points)
         values ($1,$2,$3,$4,2,$5)`,
        [sessionId, i, challenge.challenge_id, challenge.version_id, challenge.points],
      );
      await db.query(
        `insert into challenge_attempts
          (session_id,user_id,challenge_id,challenge_version_id,attempt_number,
           idempotency_key,request_hash,response_payload,status,
           awarded_points,max_points,explanation)
          values ($1,$2,$3,$4,1,$5,$6,'{}'::jsonb,'correct',$7,$7,$8)`,
        [
          sessionId,
          learnerId,
          challenge.challenge_id,
          challenge.version_id,
          randomUUID(),
          hash(randomUUID()),
          challenge.points,
          "Test-only evaluated correct response.",
        ],
      );
    }
  }

  const noCapstone = await enabled.eligibility(learnerId, skill.slug);
  assert.equal(noCapstone.completedLevels, lv.rows.length);
  assert.equal(noCapstone.passedChallenges, cv.rows.length);
  assert.equal(noCapstone.status, "incomplete", "A missing capstone must block issuance.");

  await mustRejectInSavepoint(
    () =>
      db.query(
        `insert into skill_capstone_attestations
         (requirement_set_id,user_id,reviewer_user_id,decision,evidence_digest,reason)
         values ($1,$2,$2,'passed',$3,$4)`,
        [requirementId, learnerId, hash("capstone"), reason],
      ),
    /capstone_distinct_reviewer/,
  );

  // Role-free review evidence must never unlock issuance, even when its
  // reviewer is a different real user and the signed decision says "passed".
  await db.query(
    `insert into skill_capstone_attestations
       (requirement_set_id,user_id,reviewer_user_id,decision,evidence_digest,reason,verified_at)
       values ($1,$2,$3,'passed',$4,$5,now() - interval '3 days')`,
    [requirementId, learnerId, reviewerId, hash("unauthorized-capstone"), reason],
  );
  const unauthorized = await enabled.eligibility(learnerId, skill.slug);
  assert.equal(unauthorized.status, "incomplete", "A reviewer without a role cannot qualify.");

  // In CI only, provision a real role row for the independent test reviewer.
  await db.query("insert into admin_principals (user_id,status) values ($1,'active')", [
    reviewerId,
  ]);
  await db.query(
    `insert into admin_role_assignments (user_id,role,reason,created_at)
       values ($1,'content_reviewer',$2,now() - interval '2 days')`,
    [reviewerId, reason],
  );
  const retroactive = await enabled.eligibility(learnerId, skill.slug);
  assert.equal(
    retroactive.status,
    "incomplete",
    "A later role assignment cannot retroactively legitimize old capstone evidence.",
  );

  const capstone = await db.query(
    `insert into skill_capstone_attestations
       (requirement_set_id,user_id,reviewer_user_id,decision,evidence_digest,reason,verified_at)
       values ($1,$2,$3,'passed',$4,$5,now() - interval '1 day') returning id`,
    [requirementId, learnerId, reviewerId, hash("capstone"), reason],
  );
  await mustRejectInSavepoint(
    () =>
      db.query("update skill_capstone_attestations set reason = 'tampered' where id = $1", [
        capstone.rows[0].id,
      ]),
    /append-only/,
  );

  // An otherwise completed learner with every correct challenge must still fail
  // when just one level's best completed score is below the proposed 80% threshold.
  assert(boundarySessionId, "A qualifying test session must exist.");
  const reduced = await db.query(
    `update level_play_sessions
        set awarded_points = floor(max_points * 0.79)::int
      where id = $1 returning awarded_points, max_points`,
    [boundarySessionId],
  );
  assert(reduced.rows[0].awarded_points * 100 < reduced.rows[0].max_points * 80);
  const belowThreshold = await enabled.eligibility(learnerId, skill.slug);
  assert.equal(belowThreshold.status, "incomplete", "79% cannot qualify for a certificate.");
  assert.equal(belowThreshold.completedLevels, lv.rows.length - 1);
  assert.equal(belowThreshold.passedChallenges, cv.rows.length);
  await assert.rejects(
    () => enabled.issue(fakeLearner, skill.slug),
    (error) => error.statusCode === 409,
  );
  const raised = await db.query(
    `update level_play_sessions
        set awarded_points = ceil(max_points * 0.80)::int
      where id = $1 returning awarded_points, max_points`,
    [boundarySessionId],
  );
  assert(raised.rows[0].awarded_points * 100 >= raised.rows[0].max_points * 80);

  const eligible = await enabled.eligibility(learnerId, skill.slug);
  assert.equal(eligible.status, "eligible");
  assert.equal(eligible.completedLevels, lv.rows.length);
  const historicalBefore = await auditCertificateHistory(db, enabled);
  assert.equal(historicalBefore.policyCount, 1);
  assert.equal(historicalBefore.fullCoverageProven, true);
  assert.equal(historicalBefore.frozenAwardEvidenceAnomalies, 0);
  assert.equal(historicalBefore.results[0].eligibleButNotIssued, 1);
  assert.equal(historicalBefore.results[0].alreadyIssued, 0);
  assert.equal(historicalBefore.certificationStatus, "AUDITED_NO_WRITES");
  const first = await enabled.issue(fakeLearner, skill.slug);
  assert.equal(first.status, "issued");
  assert.match(first.publicId, /^SC-[A-Za-z0-9_-]{32}$/);
  const repeated = await enabled.issue(fakeLearner, skill.slug);
  assert.equal(repeated.id, first.id);
  const historyAfter = await auditCertificateHistory(db, enabled);
  assert.equal(historyAfter.results[0].eligibleButNotIssued, 0);
  assert.equal(historyAfter.results[0].alreadyIssued, 1);
  assert.equal(historyAfter.frozenAwards.total, 1);
  assert.equal(historyAfter.frozenAwards.issued, 1);
  assert.equal(historyAfter.frozenAwardEvidenceAnomalies, 0);
  const list = await enabled.list(learnerId);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, first.id);
  assert.equal(await enabled.list(reviewerId).then((x) => x.length), 0);
  assert.equal((await enabled.eligibility(learnerId, skill.slug)).status, "earned");

  const pdf = await enabled.downloadPdf(learnerId, first.id);
  assert(pdf.toString("ascii", 0, 8) === "%PDF-1.4");
  assert(pdf.toString("ascii").includes("/MediaBox [0 0 841.89 595.28]"));
  await assert.rejects(
    () => enabled.downloadPdf(reviewerId, first.id),
    (error) => error.statusCode === 404,
    "Other accounts must never download a learner's earned certificate.",
  );

  await mustRejectInSavepoint(
    () =>
      db.query("update skill_certificate_awards set learner_name = 'Tampered Name' where id = $1", [
        first.id,
      ]),
    /Issued certificate evidence is immutable/,
  );
  const events = await db.query("select id from skill_certificate_events where award_id = $1", [
    first.id,
  ]);
  assert.equal(events.rows.length, 2, "Issue and verified owner download must both be auditable.");
  await mustRejectInSavepoint(
    () => db.query("delete from skill_certificate_events where id = $1", [events.rows[0].id]),
    /append-only/,
  );

  console.info(
    `AIFS certificate PostgreSQL smoke passed: unauthorized/retroactive capstone rejected, authorized human role required; 79% rejected and 80% accepted on one required level; ${lv.rows.length} genuine test sessions, ${cv.rows.length} evaluated attempts, no issuance before capstone, exactly one idempotent award, account isolation, immutable evidence. Fixture rolled back.`,
  );
} finally {
  await db.query("rollback");
  db.release();
  await pool.end();
}
