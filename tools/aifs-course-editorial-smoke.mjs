import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { createCourseEditorialService } from "../apps/api/src/course-editorial.ts";
import {
  importDraft,
  loadAndValidateExcelDraft,
} from "../packages/database/src/cli/import-aifs-excel-draft.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("AIFS reviewer smoke requires an explicit test DATABASE_URL.");

const pool = new Pool({ connectionString: url, max: 1, allowExitOnIdle: true });
const client = await pool.connect();
const users = Array.from({ length: 4 }, () => randomUUID());
const editor = { userId: users[0], roles: ["content_editor"] };
const subject = { userId: users[1], roles: ["content_reviewer"] };
const accessibility = { userId: users[2], roles: ["content_reviewer"] };
const publisher = { userId: users[3], roles: ["publisher"] };
const reason = "Independently verified fictional AIFS draft for PostgreSQL integration testing.";
const subjectChecklist = {
  facts_verified: true,
  answer_keys_verified: true,
  source_rights_verified: true,
  assessments_verified: true,
};
const accessibilityChecklist = {
  language_checked: true,
  keyboard_mobile_checked: true,
  accessibility_checked: true,
  capstone_verified: true,
};

// The importer and every editorial action share ONE isolated PostgreSQL transaction.
// Service-level begin/commit are savepoints: smoke never permanently imports or publishes.
const smokeClient = {
  query(sql, values) {
    if (sql === "begin") return client.query("savepoint editorial_smoke");
    if (sql === "commit") return client.query("release savepoint editorial_smoke");
    if (sql === "rollback") return client.query("rollback to savepoint editorial_smoke");
    return client.query(sql, values);
  },
  release() {},
};
const scopedPool = {
  connect: async () => smokeClient,
  query: (...args) => client.query(...args),
};
const guarded = createCourseEditorialService({ pool: scopedPool, publishEnabled: false });
const enabled = createCourseEditorialService({ pool: scopedPool, publishEnabled: true });

try {
  await client.query("begin");
  for (const id of users) {
    await client.query("insert into users(id, status) values ($1, 'active')", [id]);
  }
  const draft = loadAndValidateExcelDraft();
  assert.equal(await importDraft(client, draft.modules), "imported");

  await assert.rejects(
    () => guarded.submit(publisher, "excel-google-sheets-work", { reason }),
    (error) => error.statusCode === 403,
    "A publisher must not submit an editorial course as author.",
  );
  const submitted = await guarded.submit(editor, "excel-google-sheets-work", { reason });
  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.counts.levels, 24);
  assert.equal(submitted.counts.challenges, 72);
  assert.match(submitted.digest, /^[0-9a-f]{64}$/);

  await assert.rejects(
    () =>
      guarded.review({ ...editor, roles: ["content_editor", "content_reviewer"] }, submitted.id, {
        kind: "subject",
        decision: "approve",
        reason,
        checklist: subjectChecklist,
      }),
    (error) => error.statusCode === 409,
    "A submitter may not approve their own content even with reviewer privilege.",
  );
  await assert.rejects(
    () =>
      guarded.review(subject, submitted.id, {
        kind: "subject",
        decision: "approve",
        reason,
        checklist: {},
      }),
    (error) => error.statusCode === 409,
    "A reviewer cannot bypass mandatory human checklist evidence.",
  );

  // Only mutate an actual Excel challenge to verify the submission fingerprint.
  const excelChallenge = await client.query(
    `select ce.challenge_version_id, ce.private_evaluation
      from challenge_evaluations ce
      join challenge_versions cv on cv.id = ce.challenge_version_id
      join challenges c on c.id = cv.challenge_id
      join levels l on l.id = c.level_id
      join lessons les on les.id = l.lesson_id
      join learning_modules m on m.id = les.module_id
      join learning_paths p on p.id = m.learning_path_id
      where p.slug = 'excel-google-sheets-work' limit 1`,
  );
  assert(excelChallenge.rows.length === 1);
  const originalEvaluation = excelChallenge.rows[0].private_evaluation;
  await client.query(
    "update challenge_evaluations set private_evaluation = '{}'::jsonb where challenge_version_id = $1",
    [excelChallenge.rows[0].challenge_version_id],
  );
  await assert.rejects(
    () =>
      guarded.review(subject, submitted.id, {
        kind: "subject",
        decision: "approve",
        reason,
        checklist: subjectChecklist,
      }),
    (error) => error.statusCode === 409,
    "Altered private evaluator keys must invalidate the frozen submission.",
  );
  await client.query(
    "update challenge_evaluations set private_evaluation = $2::jsonb where challenge_version_id = $1",
    [excelChallenge.rows[0].challenge_version_id, JSON.stringify(originalEvaluation)],
  );
  const first = await guarded.review(subject, submitted.id, {
    kind: "subject",
    decision: "approve",
    reason,
    checklist: subjectChecklist,
  });
  assert.equal(first.status, "submitted");
  const second = await guarded.review(accessibility, submitted.id, {
    kind: "accessibility",
    decision: "approve",
    reason,
    checklist: accessibilityChecklist,
  });
  assert.equal(second.status, "approved");

  await assert.rejects(
    () =>
      guarded.publish(publisher, submitted.id, {
        reason,
        stagingEvidenceUrl: "https://example.org/qa",
      }),
    (error) => error.statusCode === 403,
    "Default-disabled publisher authority must fail closed.",
  );
  await assert.rejects(
    () =>
      enabled.publish({ ...editor, roles: ["content_editor", "publisher"] }, submitted.id, {
        reason,
        stagingEvidenceUrl: "https://example.org/qa",
      }),
    (error) => error.statusCode === 409,
    "Submitter and publisher must be distinct humans.",
  );
  const released = await enabled.publish(publisher, submitted.id, {
    reason,
    stagingEvidenceUrl: "https://github.com/SkillStep/skillup-platform/actions",
  });
  assert.equal(released.status, "published");
  const status = await client.query(
    `select s.status,
      (select count(*)::int from challenge_versions cv
         join challenges c on c.id = cv.challenge_id
         join levels l on l.id = c.level_id
         join lessons les on les.id = l.lesson_id
         join learning_modules m on m.id = les.module_id
         join learning_paths p on p.id = m.learning_path_id
         where p.slug = 'excel-google-sheets-work' and cv.state = 'published') as exercises
      from skills s where s.slug = 'excel-google-sheets-work'`,
  );
  assert.equal(status.rows[0].status, "published");
  assert.equal(status.rows[0].exercises, 72);

  await assert.rejects(
    () => enabled.rollback(publisher, submitted.id, { reason }),
    (error) => error.statusCode === 409,
    "First release has no previous approved snapshot; rollback cannot fabricate one.",
  );
  const withdrawn = await enabled.withdraw(publisher, submitted.id, { reason });
  assert.equal(withdrawn.status, "withdrawn");
  const history = await enabled.history("excel-google-sheets-work");
  assert.equal(history[0].status, "withdrawn");
  assert.equal(history[0].reviews.length, 2);
  assert(history[0].events.some((event) => event.action === "withdraw"));

  await assert.rejects(
    () =>
      client.query(
        "update course_editorial_reviews set reason = 'tamper' where submission_id = $1",
        [submitted.id],
      ),
    /append-only/,
    "Approval evidence cannot be rewritten or deleted.",
  );
  // The above PostgreSQL trigger intentionally invalidated the nested transaction.
  // The outer finally block always rolls the entire smoke fixture back.
  console.info(
    "AIFS editorial PostgreSQL smoke passed: 24 levels, 72 evaluations, four separate humans, fingerprint tamper rejection, disabled default, publishing, withdrawal, append-only evidence; full fixture rollback.",
  );
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}
