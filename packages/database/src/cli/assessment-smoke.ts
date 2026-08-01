import { createDatabaseClient, requireDatabaseUrl } from "../index.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-assessment-smoke",
  maxConnections: 2,
});

try {
  const incompleteCoverage = await client.pool.query<{
    path_id: string;
    locale: string;
    baseline_count: number;
    end_path_count: number;
  }>(
    `with published_paths as (
       select distinct lp.id as path_id, lv.locale
         from level_versions lv
         join levels l on l.id = lv.level_id
         join lessons le on le.id = l.lesson_id
         join learning_modules lm on lm.id = le.module_id
         join learning_paths lp on lp.id = lm.learning_path_id
        where lv.state = 'published'
     )
     select published.path_id,
            published.locale,
            count(*) filter (where assessment.assessment_kind = 'baseline')::int as baseline_count,
            count(*) filter (where assessment.assessment_kind = 'end_path')::int as end_path_count
       from published_paths published
       left join published_path_assessment_levels assessment
         on assessment.learning_path_id = published.path_id
        and assessment.locale = published.locale
      group by published.path_id, published.locale
     having count(*) filter (where assessment.assessment_kind = 'baseline') <> 1
         or count(*) filter (where assessment.assessment_kind = 'end_path') <> 1`,
  );

  if (incompleteCoverage.rows.length > 0) {
    const row = incompleteCoverage.rows[0];
    throw new Error(
      `Assessment coverage is incomplete for ${row?.path_id ?? "unknown"}/${row?.locale ?? "unknown"}: ${row?.baseline_count ?? 0} baseline, ${row?.end_path_count ?? 0} end-path.`,
    );
  }

  const trigger = await client.pool.query<{ exists: boolean }>(
    `select exists (
       select 1
         from pg_trigger
        where tgname = 'level_play_sessions_capture_assessment_result'
          and not tgisinternal
     ) as exists`,
  );
  if (!trigger.rows[0]?.exists) {
    throw new Error("Assessment result capture trigger is missing.");
  }

  const publishedPathCount = await client.pool.query<{ count: number }>(
    `select count(distinct (learning_path_id, locale))::int as count
       from published_path_assessment_levels`,
  );
  console.log(
    `Assessment lifecycle verified for ${publishedPathCount.rows[0]?.count ?? 0} published path/locale combinations.`,
  );
} finally {
  await client.close();
}
