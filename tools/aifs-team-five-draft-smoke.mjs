import assert from "node:assert/strict";

import { createDatabaseClient, requireDatabaseUrl } from "../packages/database/src/index.ts";
import {
  importDraftCourseOutlines,
  loadAndValidateDraftCourseOutlines,
} from "../packages/database/src/cli/import-aifs-course-outlines.ts";
import { buildTeamFiveImportPlan, importTeamFiveDrafts } from "./import-aifs-team-five-drafts.mjs";
import { readTeamFiveCourseDrafts } from "./validate-aifs-team-five-courses.mjs";

// In a real PostgreSQL CI database, prove draft import, reused course identity,
// all 360 private deterministic evaluations and idempotence. Never commit the transaction.
const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-aifs-team-five-rollback-smoke",
  maxConnections: 1,
});
const db = await client.pool.connect();
try {
  await db.query("begin");
  const before = await db.query(
    "select count(*)::int as total from skill_versions where status = 'published'",
  );
  const outlines = loadAndValidateDraftCourseOutlines();
  await importDraftCourseOutlines(db, outlines);
  const plan = buildTeamFiveImportPlan(readTeamFiveCourseDrafts());
  const first = await importTeamFiveDrafts(db, plan);
  assert.equal(first.imported, 5);
  assert.equal(first.alreadyImported, 0);
  assert.equal(first.courses, 5);
  assert.equal(first.levels, 120);
  assert.equal(first.challenges, 360);
  assert.equal(first.published, 0);
  const second = await importTeamFiveDrafts(db, plan);
  assert.equal(second.imported, 0);
  assert.equal(second.alreadyImported, 5);

  const evaluations = await db.query(
    `select count(*)::int as total
       from skill_versions sv
       join skills s on s.id = sv.skill_id
       join learning_paths p on p.skill_id = s.id
       join learning_modules m on m.learning_path_id = p.id
       join lessons les on les.module_id = m.id
       join levels l on l.lesson_id = les.id
       join challenges c on c.level_id = l.id
       join challenge_versions cv on cv.challenge_id = c.id
       join challenge_evaluations ce on ce.challenge_version_id = cv.id
       where s.slug = any($1::text[])
         and cv.state = 'draft'
         and ce.evaluator = 'deterministic_v1'
         and ce.private_evaluation <> '{}'::jsonb`,
    [plan.courses.map((course) => course.courseSlug)],
  );
  assert.equal(evaluations.rows[0]?.total, 360);
  const after = await db.query(
    "select count(*)::int as total from skill_versions where status = 'published'",
  );
  assert.equal(after.rows[0]?.total, before.rows[0]?.total);
  console.info(
    "Five-course PostgreSQL smoke PASS: 120 retained draft level IDs, 360 deterministic private evaluations, idempotent second import, zero new publications; rolling back.",
  );
} finally {
  await db.query("rollback");
  db.release();
  await client.close();
}
