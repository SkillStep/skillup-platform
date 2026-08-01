import { createHash } from "node:crypto";

import {
  completeLaunchCurriculum,
  launchCategoryDefinitions,
} from "./complete-launch-curriculum.js";
import { launchChallenges } from "./complete-launch-challenges.js";
import { createDatabaseClient, requireDatabaseUrl } from "./index.js";
import { launchCatalogSeed } from "./seed-data.js";

const reviewedAt = new Date("2026-08-01T00:00:00.000Z");

function slug(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function stableUuid(key: string): string {
  const raw = createHash("sha256").update(`skillup-launch:${key}`).digest("hex").slice(0, 32);
  const chars = raw.split("");
  chars[12] = "4";
  chars[16] = "8";
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function objectiveCode(skillSlug: string, moduleIndex: number, levelIndex: number): string {
  const prefix = skillSlug
    .split("-")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 12);
  return `${prefix}_M${String(moduleIndex + 1).padStart(2, "0")}_L${String(levelIndex + 1).padStart(2, "0")}`;
}

function strongApproach(objective: string): string {
  return `Confirm the requirement, use specific evidence and take a clear, proportionate action to ${objective}.`;
}

function weakApproach(objective: string): string {
  return `Rely on a vague assumption and act without checking evidence while trying to ${objective}.`;
}

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-complete-launch-seed-v2",
  maxConnections: 2,
});
const database = await client.pool.connect();

async function queryId(sql: string, values: readonly unknown[], label: string): Promise<string> {
  const result = await database.query<{ id: string }>(sql, [...values]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`${label} could not be resolved.`);
  return id;
}

async function isPublished(table: string, id: string): Promise<boolean> {
  const allowed = new Set([
    "learning_module_versions",
    "lesson_versions",
    "level_versions",
    "challenge_versions",
  ]);
  if (!allowed.has(table)) throw new Error(`Unsupported version table: ${table}.`);
  const result = await database.query<{ state: string }>(
    `select state from ${table} where id = $1`,
    [id],
  );
  return result.rows[0]?.state === "published";
}

async function publishRecord(
  entityType: string,
  entityVersionId: string,
  canonicalPath: string,
  indexPolicy: "index" | "noindex",
): Promise<void> {
  await database.query(
    `insert into content_publication_records
      (entity_type, entity_version_id, state, index_policy, canonical_path,
       reviewed_at, published_at, updated_at)
     select $1, $2, 'published', $3, $4, $5, $5, $5
     where not exists (
       select 1 from content_publication_records
        where entity_type = $1 and entity_version_id = $2
     )`,
    [entityType, entityVersionId, indexPolicy, canonicalPath, reviewedAt],
  );
}

async function resolveCategoryIds(): Promise<Map<string, string>> {
  const categoryIds = new Map<string, string>();
  for (const [index, [categorySlug, definition]] of Object.entries(
    launchCategoryDefinitions,
  ).entries()) {
    const categoryId = await queryId(
      `insert into skill_categories (id, slug, default_locale, sort_order)
       values ($1, $2, 'en', $3)
       on conflict (slug) do update set sort_order = excluded.sort_order
       returning id`,
      [stableUuid(`category:${categorySlug}`), categorySlug, index + 1],
      `Category ${categorySlug}`,
    );
    categoryIds.set(categorySlug, categoryId);

    await database.query(
      `insert into skill_category_versions
        (id, category_id, version, locale, title, summary, state, index_policy,
         reviewed_at, published_at)
       select $1, $2, 1, 'en', $3, $4, 'published', 'index', $5, $5
       where not exists (
         select 1 from skill_category_versions
          where category_id = $2 and version = 1 and locale = 'en'
       )`,
      [
        stableUuid(`category:${categorySlug}:v1`),
        categoryId,
        definition[0],
        definition[1],
        reviewedAt,
      ],
    );
    const categoryVersionId = await queryId(
      `select id from skill_category_versions
        where category_id = $1 and version = 1 and locale = 'en'`,
      [categoryId],
      `Category version ${categorySlug}`,
    );
    await publishRecord(
      "skill_category_version",
      categoryVersionId,
      `/en/skills/${categorySlug}`,
      "index",
    );
  }
  return categoryIds;
}

try {
  await database.query("begin");
  const categoryIds = await resolveCategoryIds();

  for (const curriculum of completeLaunchCurriculum) {
    const catalog = launchCatalogSeed.find((item) => item.skill.slug === curriculum.skillSlug);
    if (!catalog) throw new Error(`Missing launch catalog entry for ${curriculum.skillSlug}.`);
    const categoryId = categoryIds.get(curriculum.category);
    if (!categoryId) throw new Error(`Missing resolved category ${curriculum.category}.`);

    await database.query(`update skills set status = 'published', updated_at = $2 where id = $1`, [
      catalog.skill.id,
      reviewedAt,
    ]);
    await database.query(
      `update skill_versions
          set status = 'published', reviewed_at = coalesce(reviewed_at, $2),
              published_at = coalesce(published_at, $2)
        where id = $1 and status <> 'published'`,
      [catalog.skill.versionId, reviewedAt],
    );
    await database.query(
      `update learning_paths set status = 'published', updated_at = $2 where id = $1`,
      [catalog.path.id, reviewedAt],
    );
    await database.query(
      `update learning_path_versions
          set status = 'published', reviewed_at = coalesce(reviewed_at, $2),
              published_at = coalesce(published_at, $2)
        where id = $1 and status <> 'published'`,
      [catalog.path.versionId, reviewedAt],
    );
    await database.query(
      `insert into skill_category_memberships (category_id, skill_id, sort_order)
       values ($1, $2, $3)
       on conflict (skill_id) do update
         set category_id = excluded.category_id, sort_order = excluded.sort_order`,
      [categoryId, catalog.skill.id, catalog.path.sortOrder],
    );
    await publishRecord(
      "skill_version",
      catalog.skill.versionId,
      `/en/skills/${catalog.skill.slug}`,
      "index",
    );
    await publishRecord(
      "learning_path_version",
      catalog.path.versionId,
      `/en/courses/${catalog.path.slug}`,
      "index",
    );

    for (const [moduleIndex, curriculumModule] of curriculum.modules.entries()) {
      const moduleSlug = slug(curriculumModule.title);
      const moduleId = await queryId(
        `insert into learning_modules (id, learning_path_id, slug, sort_order)
         values ($1, $2, $3, $4)
         on conflict (learning_path_id, slug) do update set sort_order = excluded.sort_order
         returning id`,
        [
          stableUuid(`${curriculum.skillSlug}:module:${moduleSlug}`),
          catalog.path.id,
          moduleSlug,
          moduleIndex + 10,
        ],
        `Module ${moduleSlug}`,
      );
      await database.query(
        `insert into learning_module_versions
          (id, module_id, learning_path_version_id, version, locale, title, summary,
           state, index_policy, reviewed_at, published_at)
         select $1, $2, $3, 1, 'en', $4, $5, 'approved', 'noindex', $6, null
         where not exists (
           select 1 from learning_module_versions
            where module_id = $2 and version = 1 and locale = 'en'
         )`,
        [
          stableUuid(`${curriculum.skillSlug}:module:${moduleSlug}:v1`),
          moduleId,
          catalog.path.versionId,
          curriculumModule.title,
          `Practice the essential decisions in ${curriculumModule.title.toLocaleLowerCase("en-US")} through concise, realistic study and work situations.`,
          reviewedAt,
        ],
      );
      const moduleVersionId = await queryId(
        `select id from learning_module_versions
          where module_id = $1 and version = 1 and locale = 'en'`,
        [moduleId],
        `Module version ${moduleSlug}`,
      );

      for (const [levelIndex, levelDefinition] of curriculumModule.levels.entries()) {
        const [title, objective] = levelDefinition;
        const levelSlug = slug(title);
        const lessonSlug = `${levelSlug}-lesson`;
        const lessonId = await queryId(
          `insert into lessons (id, module_id, slug, sort_order)
           values ($1, $2, $3, $4)
           on conflict (module_id, slug) do update set sort_order = excluded.sort_order
           returning id`,
          [
            stableUuid(`${curriculum.skillSlug}:lesson:${lessonSlug}`),
            moduleId,
            lessonSlug,
            levelIndex + 1,
          ],
          `Lesson ${lessonSlug}`,
        );
        await database.query(
          `insert into lesson_versions
            (id, lesson_id, module_version_id, version, locale, title, summary,
             estimated_minutes, state, index_policy, reviewed_at, published_at)
           select $1, $2, $3, 1, 'en', $4, $5, 8, 'approved', 'noindex', $6, null
           where not exists (
             select 1 from lesson_versions
              where lesson_id = $2 and version = 1 and locale = 'en'
           )`,
          [
            stableUuid(`${curriculum.skillSlug}:lesson:${lessonSlug}:v1`),
            lessonId,
            moduleVersionId,
            title,
            `Learn how to ${objective} with a specific, evidence-based action and a clear boundary for common mistakes.`,
            reviewedAt,
          ],
        );
        const lessonVersionId = await queryId(
          `select id from lesson_versions
            where lesson_id = $1 and version = 1 and locale = 'en'`,
          [lessonId],
          `Lesson version ${lessonSlug}`,
        );
        const levelId = await queryId(
          `insert into levels (id, lesson_id, slug, sort_order)
           values ($1, $2, $3, 1)
           on conflict (lesson_id, slug) do update set sort_order = excluded.sort_order
           returning id`,
          [stableUuid(`${curriculum.skillSlug}:level:${levelSlug}`), lessonId, levelSlug],
          `Level ${levelSlug}`,
        );
        await database.query(
          `insert into level_versions
            (id, level_id, lesson_version_id, version, locale, title, public_summary,
             instructions, estimated_minutes, state, index_policy, reviewed_at, published_at)
           select $1, $2, $3, 1, 'en', $4, $5, $6, 6, 'approved', 'noindex', $7, null
           where not exists (
             select 1 from level_versions
              where level_id = $2 and version = 1 and locale = 'en'
           )`,
          [
            stableUuid(`${curriculum.skillSlug}:level:${levelSlug}:v1`),
            levelId,
            lessonVersionId,
            title,
            `Practice how to ${objective} and distinguish a reliable action from a vague or unsafe alternative.`,
            "Complete three short challenges. Review each explanation and identify the evidence, action and boundary that make the stronger response reliable.",
            reviewedAt,
          ],
        );
        const levelVersionId = await queryId(
          `select id from level_versions
            where level_id = $1 and version = 1 and locale = 'en'`,
          [levelId],
          `Level version ${levelSlug}`,
        );

        if (!(await isPublished("level_versions", levelVersionId))) {
          await database.query(
            `insert into learning_objectives
              (id, level_version_id, code, statement, assessable, sort_order)
             select $1, $2, $3, $4, true, 1
             where not exists (
               select 1 from learning_objectives
                where level_version_id = $2 and code = $3
             )`,
            [
              stableUuid(`${curriculum.skillSlug}:objective:${levelSlug}`),
              levelVersionId,
              objectiveCode(curriculum.skillSlug, moduleIndex, levelIndex),
              `The learner can ${objective}.`,
            ],
          );
          await database.query(
            `insert into content_source_references
              (id, level_version_id, kind, title, locator, sort_order)
             select $1, $2, 'internal_editorial', $3, $4, 1
             where not exists (
               select 1 from content_source_references where id = $1
             )`,
            [
              stableUuid(`${curriculum.skillSlug}:source:${levelSlug}`),
              levelVersionId,
              `SkillUp reviewed ${catalog.skill.title} launch curriculum`,
              `${curriculumModule.title} / ${title}`,
            ],
          );

          const strong = strongApproach(objective);
          const weak = weakApproach(objective);
          const challenges = launchChallenges({
            objective,
            strong,
            weak,
            rotation: curriculum.skillSlug.length + moduleIndex * 4 + levelIndex,
          });

          for (const [challengeIndex, definition] of challenges.entries()) {
            const challengeSlug = `${levelSlug}-${definition.key}`;
            const challengeId = await queryId(
              `insert into challenges (id, level_id, slug, sort_order)
               values ($1, $2, $3, $4)
               on conflict (level_id, slug) do update set sort_order = excluded.sort_order
               returning id`,
              [
                stableUuid(`${curriculum.skillSlug}:challenge:${challengeSlug}`),
                levelId,
                challengeSlug,
                challengeIndex + 1,
              ],
              `Challenge ${challengeSlug}`,
            );
            await database.query(
              `insert into challenge_versions
                (id, challenge_id, level_version_id, version, locale, type, prompt,
                 instruction, explanation, public_payload, points, state, reviewed_at, published_at)
               select $1, $2, $3, 1, 'en', $4, $5, $6, $7, $8::jsonb, 10,
                      'approved', $9, null
               where not exists (
                 select 1 from challenge_versions
                  where challenge_id = $2 and version = 1 and locale = 'en'
               )`,
              [
                stableUuid(`${curriculum.skillSlug}:challenge:${challengeSlug}:v1`),
                challengeId,
                levelVersionId,
                definition.type,
                definition.prompt,
                definition.instruction,
                definition.explanation,
                JSON.stringify(definition.publicPayload),
                reviewedAt,
              ],
            );
            const challengeVersionId = await queryId(
              `select id from challenge_versions
                where challenge_id = $1 and version = 1 and locale = 'en'`,
              [challengeId],
              `Challenge version ${challengeSlug}`,
            );
            if (!(await isPublished("challenge_versions", challengeVersionId))) {
              for (const [optionIndex, option] of definition.options.entries()) {
                await database.query(
                  `insert into challenge_answer_options
                    (id, challenge_version_id, option_key, label, sort_order)
                   select $1, $2, $3, $4, $5
                   where not exists (
                     select 1 from challenge_answer_options
                      where challenge_version_id = $2 and option_key = $3
                   )`,
                  [
                    stableUuid(`${curriculum.skillSlug}:option:${challengeSlug}:${option[0]}`),
                    challengeVersionId,
                    option[0],
                    option[1],
                    optionIndex + 1,
                  ],
                );
              }
              await database.query(
                `insert into challenge_evaluations
                  (challenge_version_id, evaluator, private_evaluation, updated_at)
                 select $1, 'deterministic_v1', $2::jsonb, $3
                 where not exists (
                   select 1 from challenge_evaluations where challenge_version_id = $1
                 )`,
                [challengeVersionId, JSON.stringify(definition.privateEvaluation), reviewedAt],
              );
              await database.query(
                `update challenge_versions
                    set state = 'published', published_at = $2
                  where id = $1 and state <> 'published'`,
                [challengeVersionId, reviewedAt],
              );
            }
            await publishRecord(
              "challenge_version",
              challengeVersionId,
              `/en/learn/${catalog.path.slug}/${moduleSlug}/${lessonSlug}/${levelSlug}`,
              "noindex",
            );
          }
          await database.query(
            `update level_versions
                set state = 'published', published_at = $2
              where id = $1 and state <> 'published'`,
            [levelVersionId, reviewedAt],
          );
        }
        await publishRecord(
          "level_version",
          levelVersionId,
          `/en/learn/${catalog.path.slug}/${moduleSlug}/${lessonSlug}/${levelSlug}`,
          "noindex",
        );
        await database.query(
          `update lesson_versions
              set state = 'published', published_at = $2
            where id = $1 and state <> 'published'`,
          [lessonVersionId, reviewedAt],
        );
        await publishRecord(
          "lesson_version",
          lessonVersionId,
          `/en/learn/${catalog.path.slug}/${moduleSlug}/${lessonSlug}`,
          "noindex",
        );
      }
      await database.query(
        `update learning_module_versions
            set state = 'published', published_at = $2
          where id = $1 and state <> 'published'`,
        [moduleVersionId, reviewedAt],
      );
      await publishRecord(
        "module_version",
        moduleVersionId,
        `/en/learn/${catalog.path.slug}/${moduleSlug}`,
        "noindex",
      );
    }
  }

  await database.query("commit");
  const totalLevels = completeLaunchCurriculum.reduce(
    (total, skill) =>
      total + skill.modules.reduce((moduleTotal, module) => moduleTotal + module.levels.length, 0),
    0,
  );
  console.log(
    `Complete SkillUp launch curriculum is present (${completeLaunchCurriculum.length} skills, ${totalLevels} generated levels, ${totalLevels * 3} generated challenges).`,
  );
} catch (error) {
  await database.query("rollback").catch(() => undefined);
  throw error;
} finally {
  database.release();
  await client.close();
}
