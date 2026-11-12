import { createDatabaseClient, requireDatabaseUrl } from "../index.js";
import { importDraft, loadAndValidateExcelDraft } from "./import-aifs-excel-draft.js";

const db = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-aifs-draft-rollback-smoke",
  maxConnections: 1,
});
const connection = await db.pool.connect();

try {
  const draft = loadAndValidateExcelDraft();
  const before = await connection.query<{ count: number }>(
    "select count(*)::int as count from skills where status = 'published'",
  );
  if (before.rows[0]?.count !== 5) throw new Error("Five launch skills must already exist.");

  await connection.query("begin");
  const first = await importDraft(connection, draft.modules);
  const second = await importDraft(connection, draft.modules);
  if (first !== "imported" || second !== "already_imported") {
    throw new Error("AI draft import must be idempotent on matching content.");
  }
  const imported = await connection.query<{
    course_status: string;
    draft_levels: number;
    draft_challenges: number;
    private_keys: number;
    publicly_visible: number;
  }>(
    `select s.status as course_status,
        (select count(*)::int from level_versions where state = 'draft'
         and level_id in (
           select l.id from levels l join lessons les on les.id = l.lesson_id
           join learning_modules m on m.id = les.module_id
           join learning_paths p on p.id = m.learning_path_id
           where p.slug = 'excel-google-sheets-work'
         )) as draft_levels,
        (select count(*)::int from challenge_versions cv join challenges c on c.id = cv.challenge_id
         join levels l on l.id = c.level_id join lessons les on les.id = l.lesson_id
         join learning_modules m on m.id = les.module_id
         join learning_paths p on p.id = m.learning_path_id
         where p.slug = 'excel-google-sheets-work' and cv.state = 'draft') as draft_challenges,
        (select count(*)::int from challenge_evaluations e
          join challenge_versions cv on cv.id = e.challenge_version_id
          join challenges c on c.id = cv.challenge_id
          join levels l on l.id = c.level_id join lessons les on les.id = l.lesson_id
          join learning_modules m on m.id = les.module_id
          join learning_paths p on p.id = m.learning_path_id
          where p.slug = 'excel-google-sheets-work') as private_keys,
        (select count(*)::int from skill_versions sv
          join skills s2 on s2.id = sv.skill_id
          where s2.slug = 'excel-google-sheets-work' and sv.status = 'published') as publicly_visible
      from skills s where s.slug = 'excel-google-sheets-work'`,
  );
  const row = imported.rows[0];
  if (
    !row ||
    row.course_status !== "draft" ||
    row.draft_levels !== 24 ||
    row.draft_challenges !== 72 ||
    row.private_keys !== 72 ||
    row.publicly_visible !== 0
  ) {
    throw new Error(`AI draft import violates the unpublished hierarchy: ${JSON.stringify(row)}`);
  }
  await connection.query("rollback");

  const after = await connection.query<{ count: number }>(
    "select count(*)::int as count from skills where status = 'published'",
  );
  const remains = await connection.query<{ count: number }>(
    "select count(*)::int as count from skills where slug = 'excel-google-sheets-work'",
  );
  if (after.rows[0]?.count !== before.rows[0]?.count || remains.rows[0]?.count !== 0) {
    throw new Error("The transaction rollback failed to remove the draft after smoke testing.");
  }
  console.info(
    "AI-first draft importer smoke passed (24 draft levels, 72 private keys, idempotent import, no publication, rollback).",
  );
} catch (error) {
  await connection.query("rollback");
  throw error;
} finally {
  connection.release();
  await db.close();
}
