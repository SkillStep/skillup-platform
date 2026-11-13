import { createDatabaseClient, requireDatabaseUrl } from "../index.js";
import {
  importDraftCourseOutlines,
  loadAndValidateDraftCourseOutlines,
} from "./import-aifs-course-outlines.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-aifs-all-outline-rollback-smoke",
  maxConnections: 1,
});
const connection = await client.pool.connect();

try {
  const plan = loadAndValidateDraftCourseOutlines();
  const publishedBefore = await connection.query<{ count: number }>(
    "select count(*)::int as count from skills where status = 'published'",
  );
  if (publishedBefore.rows[0]?.count !== 5) {
    throw new Error("The five reviewed launch courses must exist before draft smoke.");
  }

  await connection.query("begin");
  const initial = await importDraftCourseOutlines(connection, plan);
  const repeat = await importDraftCourseOutlines(connection, plan);
  if (
    initial.imported !== 14 ||
    initial.alreadyImported !== 0 ||
    initial.modules !== 56 ||
    initial.levels !== 336 ||
    repeat.imported !== 0 ||
    repeat.alreadyImported !== 14
  ) {
    throw new Error(
      `Draft import is not complete or idempotent: ${JSON.stringify({ initial, repeat })}`,
    );
  }

  const state = await connection.query<{
    private_courses: number;
    draft_skill_versions: number;
    draft_paths: number;
    draft_modules: number;
    draft_levels: number;
    fake_approvals: number;
    published: number;
    challenges: number;
    visible_publications: number;
  }>(
    `select
      (select count(*)::int from skills s where s.slug = any($1::text[]) and s.status = 'draft')
         as private_courses,
      (select count(*)::int from skill_versions sv join skills s on s.id = sv.skill_id
         where s.slug = any($1::text[]) and sv.status = 'draft'
           and sv.reviewed_at is null and sv.published_at is null) as draft_skill_versions,
      (select count(*)::int from learning_paths p where p.slug = any($1::text[])
         and p.status = 'draft') as draft_paths,
      (select count(*)::int from learning_module_versions mv
         join learning_modules m on m.id = mv.module_id
         join learning_paths p on p.id = m.learning_path_id
         where p.slug = any($1::text[]) and mv.state = 'draft') as draft_modules,
      (select count(*)::int from level_versions lv join levels l on l.id = lv.level_id
         join lessons les on les.id = l.lesson_id
         join learning_modules m on m.id = les.module_id
         join learning_paths p on p.id = m.learning_path_id
         where p.slug = any($1::text[]) and lv.state = 'draft') as draft_levels,
      (select count(*)::int from level_versions lv join levels l on l.id = lv.level_id
         join lessons les on les.id = l.lesson_id
         join learning_modules m on m.id = les.module_id
         join learning_paths p on p.id = m.learning_path_id
         where p.slug = any($1::text[]) and (lv.reviewed_at is not null or lv.published_at is not null))
         as fake_approvals,
      (select count(*)::int from skills where status = 'published') as published,
      (select count(*)::int from challenges c join levels l on l.id = c.level_id
         join lessons les on les.id = l.lesson_id join learning_modules m on m.id = les.module_id
         join learning_paths p on p.id = m.learning_path_id where p.slug = any($1::text[]))
         as challenges,
      (select count(*)::int from content_publication_records cr
         join level_versions lv on lv.id = cr.entity_version_id
         join levels l on l.id = lv.level_id join lessons les on les.id = l.lesson_id
         join learning_modules m on m.id = les.module_id
         join learning_paths p on p.id = m.learning_path_id
         where p.slug = any($1::text[])) as visible_publications`,
    [plan.courses.map((entry) => entry.scope.slug)],
  );
  const row = state.rows[0];
  if (
    !row ||
    row.private_courses !== 14 ||
    row.draft_skill_versions !== 14 ||
    row.draft_paths !== 14 ||
    row.draft_modules !== 56 ||
    row.draft_levels !== 336 ||
    row.fake_approvals !== 0 ||
    row.published !== publishedBefore.rows[0]?.count ||
    row.challenges !== 0 ||
    row.visible_publications !== 0
  ) {
    throw new Error(`Draft outlines risk public exposure or fake approval: ${JSON.stringify(row)}`);
  }

  const category = await connection.query<{ state: string; reviewed_at: Date | null }>(
    `select sv.state, sv.reviewed_at
       from skill_category_versions sv
       join skill_categories s on s.id = sv.category_id
      where s.slug = 'life-skills'`,
  );
  if (
    category.rows.length !== 1 ||
    category.rows[0]?.state !== "draft" ||
    category.rows[0]?.reviewed_at !== null
  ) {
    throw new Error("The newly proposed life-skills category must stay in unreviewed draft.");
  }

  await connection.query("rollback");
  const after = await connection.query<{ remaining: number; published: number }>(
    `select
      (select count(*)::int from skills where slug = any($1::text[])) as remaining,
      (select count(*)::int from skills where status = 'published') as published`,
    [plan.courses.map((entry) => entry.scope.slug)],
  );
  if (
    after.rows[0]?.remaining !== 0 ||
    after.rows[0]?.published !== publishedBefore.rows[0]?.count
  ) {
    throw new Error("Draft rollback left unintended rows or changed the published catalogue.");
  }
  console.info(
    "AI-first 14-course PostgreSQL smoke passed: 56 draft modules, 336 draft levels, zero new published/approved lessons, idempotent transaction and full rollback.",
  );
} catch (error) {
  await connection.query("rollback");
  throw error;
} finally {
  connection.release();
  await client.close();
}
