import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

type CatalogRow = Readonly<{
  skill_slug: string;
  title: string;
  summary: string;
  path_slug: string;
  level_id: string;
  level_title: string;
  level_minutes: number;
  module_id: string;
  module_title: string;
  challenge_type: string;
  objective_statement: string | null;
}>;

const QuerySchema = z.object({ locale: z.enum(["en", "ur"]).default("en") });

const readableChallengeTypes: Readonly<Record<string, string>> = {
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  scenario: "Scenario decisions",
  ordering: "Ordering",
  matching: "Matching",
  fill_blank: "Fill in the blank",
  short_response: "Short-response practice",
};

export type PublishedCourseLevel = Readonly<{
  id: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
  estimatedMinutes: number;
}>;

export type PublishedCourse = Readonly<{
  slug: string;
  title: string;
  summary: string;
  pathSlug: string;
  levelId: string;
  levelCount: number;
  moduleCount: number;
  modules: readonly string[];
  levels: readonly PublishedCourseLevel[];
  outcomes: readonly string[];
  challengeTypes: readonly string[];
  estimatedMinutes: number;
}>;

/**
 * Read only versions with real publication evidence and at least one playable
 * challenge with private evaluation. Drafts and incomplete modules never appear.
 * Note: no private evaluation or learner information is returned to the client.
 */
export const PUBLISHED_COURSES_SQL = `
select
  s.slug as skill_slug,
  sv.title,
  sv.summary,
  lp.slug as path_slug,
  m.id as module_id,
  mv.title as module_title,
  lv.id as level_id,
  lvlv.title as level_title,
  lvlv.estimated_minutes as level_minutes,
  cv.type as challenge_type,
  objective.statement as objective_statement
from skills s
join lateral (
  select v.* from skill_versions v
  where v.skill_id = s.id
    and v.locale = $1 and v.status = 'published'
    and v.reviewed_at is not null and v.published_at <= now()
  order by v.version desc limit 1
) sv on true
join learning_paths lp
  on lp.skill_id = s.id and lp.status = 'published'
join lateral (
  select v.* from learning_path_versions v
  where v.learning_path_id = lp.id
    and v.locale = $1 and v.status = 'published'
    and v.reviewed_at is not null and v.published_at <= now()
  order by v.version desc limit 1
) lpv on true
join learning_modules m on m.learning_path_id = lp.id
join lateral (
  select v.* from learning_module_versions v
  where v.module_id = m.id and v.learning_path_version_id = lpv.id
    and v.locale = $1 and v.state = 'published'
    and v.reviewed_at is not null and v.published_at <= now()
  order by v.version desc limit 1
) mv on true
join lessons les on les.module_id = m.id
join lateral (
  select v.* from lesson_versions v
  where v.lesson_id = les.id and v.module_version_id = mv.id
    and v.locale = $1 and v.state = 'published'
    and v.reviewed_at is not null and v.published_at <= now()
  order by v.version desc limit 1
) lessv on true
join levels lv on lv.lesson_id = les.id
join lateral (
  select v.* from level_versions v
  where v.level_id = lv.id and v.lesson_version_id = lessv.id
    and v.locale = $1 and v.state = 'published'
    and v.reviewed_at is not null and v.published_at <= now()
  order by v.version desc limit 1
) lvlv on true
join challenges ch on ch.level_id = lv.id
join lateral (
  select v.* from challenge_versions v
  where v.challenge_id = ch.id and v.level_version_id = lvlv.id
    and v.locale = $1 and v.state = 'published'
    and v.reviewed_at is not null and v.published_at <= now()
    and exists (
      select 1 from challenge_evaluations ce
      where ce.challenge_version_id = v.id
        and ce.private_evaluation <> '{}'::jsonb
    )
  order by v.version desc limit 1
) cv on true
left join lateral (
  select o.statement
  from learning_objectives o
  where o.level_version_id = lvlv.id and o.assessable = true
  order by o.sort_order
  limit 1
) objective on true
where s.status = 'published' and s.default_locale = $1
order by lp.sort_order, s.slug, m.sort_order, les.sort_order, lv.sort_order, ch.sort_order
`;

export function projectPublishedCourses(rows: readonly CatalogRow[]): readonly PublishedCourse[] {
  const records = new Map<
    string,
    {
      slug: string;
      title: string;
      summary: string;
      pathSlug: string;
      levelId: string;
      levels: Map<string, PublishedCourseLevel>;
      modules: Map<string, string>;
      outcomes: Set<string>;
      challengeTypes: Set<string>;
    }
  >();

  for (const row of rows) {
    let course = records.get(row.skill_slug);
    if (!course) {
      course = {
        slug: row.skill_slug,
        title: row.title,
        summary: row.summary,
        pathSlug: row.path_slug,
        levelId: row.level_id,
        levels: new Map(),
        modules: new Map(),
        outcomes: new Set(),
        challengeTypes: new Set(),
      };
      records.set(row.skill_slug, course);
    }
    if (!course.levels.has(row.level_id)) {
      course.levels.set(row.level_id, {
        id: row.level_id,
        title: row.level_title,
        moduleId: row.module_id,
        moduleTitle: row.module_title,
        estimatedMinutes: row.level_minutes,
      });
    }
    course.modules.set(row.module_id, row.module_title);
    if (row.objective_statement) course.outcomes.add(row.objective_statement);
    const challengeType = readableChallengeTypes[row.challenge_type];
    if (challengeType) course.challengeTypes.add(challengeType);
  }

  return [...records.values()].map((course) => ({
    slug: course.slug,
    title: course.title,
    summary: course.summary,
    pathSlug: course.pathSlug,
    levelId: course.levelId,
    levelCount: course.levels.size,
    moduleCount: course.modules.size,
    modules: [...course.modules.values()],
    levels: [...course.levels.values()],
    outcomes: [...course.outcomes].slice(0, 8),
    challengeTypes: [...course.challengeTypes],
    estimatedMinutes: [...course.levels.values()].reduce(
      (total, level) => total + level.estimatedMinutes,
      0,
    ),
  }));
}

export function createPublishedCourseCatalogService(
  options: Readonly<{ pool: DatabaseClient["pool"] }>,
): Readonly<{ list: (locale: "en" | "ur") => Promise<readonly PublishedCourse[]> }> {
  return {
    list: async (locale) => {
      const result = await options.pool.query<CatalogRow>(PUBLISHED_COURSES_SQL, [locale]);
      return projectPublishedCourses(result.rows);
    },
  };
}

export function registerPublishedCourseCatalogRoutes(
  app: FastifyInstance,
  options: Readonly<{
    service: ReturnType<typeof createPublishedCourseCatalogService>;
  }>,
): void {
  app.get("/v1/catalog/courses", async (request, reply) => {
    const query = QuerySchema.parse(request.query);
    reply.header("cache-control", "public, max-age=0, must-revalidate");
    return { courses: await options.service.list(query.locale) };
  });
}
