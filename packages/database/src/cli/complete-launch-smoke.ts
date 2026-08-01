import { createDatabaseClient, requireDatabaseUrl } from "../index.js";
import { launchCatalogSeed } from "../seed-data.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-complete-launch-smoke",
  maxConnections: 2,
});

try {
  const skills = await client.pool.query<{
    slug: string;
    skill_status: string;
    path_status: string;
    levels: number;
    challenges: number;
  }>(
    `select s.slug,
            s.status as skill_status,
            lp.status as path_status,
            count(distinct l.id)::int as levels,
            count(distinct c.id)::int as challenges
       from skills s
       join learning_paths lp on lp.skill_id = s.id
       left join learning_modules lm on lm.learning_path_id = lp.id
       left join lessons le on le.module_id = lm.id
       left join levels l on l.lesson_id = le.id
       left join challenges c on c.level_id = l.id
      where s.slug = any($1::text[])
      group by s.slug, s.status, lp.status
      order by s.slug`,
    [launchCatalogSeed.map((item) => item.skill.slug)],
  );

  if (skills.rows.length !== 5) {
    throw new Error(`Expected five launch skills, found ${skills.rows.length}.`);
  }
  for (const row of skills.rows) {
    if (row.skill_status !== "published" || row.path_status !== "published") {
      throw new Error(`${row.slug} is not fully published.`);
    }
    const requiredLevels = row.slug === "interview-workplace-communication" ? 20 : 12;
    if (row.levels < requiredLevels) {
      throw new Error(`${row.slug} has ${row.levels} levels; ${requiredLevels} are required.`);
    }
    if (row.challenges < row.levels * 3) {
      throw new Error(`${row.slug} does not have three challenges per generated level.`);
    }
  }

  const incomplete = await client.pool.query<{
    level_id: string;
    title: string;
    challenge_count: number;
    objective_count: number;
    source_count: number;
  }>(
    `select lv.level_id,
            lv.title,
            count(distinct cv.id)::int as challenge_count,
            count(distinct lo.id)::int as objective_count,
            count(distinct csr.id)::int as source_count
       from level_versions lv
       join levels l on l.id = lv.level_id
       join lessons le on le.id = l.lesson_id
       join learning_modules lm on lm.id = le.module_id
       join learning_paths lp on lp.id = lm.learning_path_id
       join skills s on s.id = lp.skill_id
       left join challenge_versions cv
         on cv.level_version_id = lv.id and cv.state = 'published'
       left join learning_objectives lo on lo.level_version_id = lv.id
       left join content_source_references csr on csr.level_version_id = lv.id
      where s.slug = any($1::text[])
        and lv.state = 'published'
      group by lv.level_id, lv.title
     having count(distinct cv.id) = 0
         or count(distinct lo.id) = 0
         or count(distinct csr.id) = 0`,
    [launchCatalogSeed.map((item) => item.skill.slug)],
  );
  if (incomplete.rows.length > 0) {
    throw new Error(`Published launch level is incomplete: ${incomplete.rows[0]?.title ?? "unknown"}.`);
  }

  const types = await client.pool.query<{ type: string; count: number }>(
    `select cv.type, count(*)::int as count
       from challenge_versions cv
       join level_versions lv on lv.id = cv.level_version_id
       join levels l on l.id = lv.level_id
       join lessons le on le.id = l.lesson_id
       join learning_modules lm on lm.id = le.module_id
       join learning_paths lp on lp.id = lm.learning_path_id
       join skills s on s.id = lp.skill_id
      where s.slug = any($1::text[])
        and cv.state = 'published'
      group by cv.type`,
    [launchCatalogSeed.map((item) => item.skill.slug)],
  );
  const typeSet = new Set(types.rows.map((row) => row.type));
  for (const requiredType of ["multiple_choice", "true_false", "scenario"]) {
    if (!typeSet.has(requiredType)) {
      throw new Error(`Launch curriculum is missing ${requiredType} challenges.`);
    }
  }

  console.log(
    `Complete launch curriculum verified (${skills.rows.reduce((sum, row) => sum + row.levels, 0)} levels, ${skills.rows.reduce((sum, row) => sum + row.challenges, 0)} challenges).`,
  );
} finally {
  await client.close();
}
