import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  readTeamFiveCourseDrafts,
  validateTeamFiveCourseDrafts,
} from "./validate-aifs-team-five-courses.mjs";

// Intentionally separate from production. Drafts are NOT publicly playable or approved.
export function assertTeamFiveDraftImportPermission(env, args) {
  if (
    args.length > 1 ||
    (args.length === 1 && !["--dry-run", "--apply-draft"].includes(args[0]))
  ) {
    throw new Error("Only --dry-run or --apply-draft is supported. Publishing is prohibited.");
  }
  if (args[0] !== "--apply-draft") return "dry_run";
  if (!["test", "development", "staging"].includes(env.APP_ENV ?? "")) {
    throw new Error("Production/unknown environments are forbidden for AI-first draft imports.");
  }
  if (env.AIFS_ALLOW_DRAFT_IMPORT !== "yes") {
    throw new Error("AIFS_ALLOW_DRAFT_IMPORT=yes required for non-production draft write.");
  }
  return "apply_draft";
}

export function stableTeamFiveId(value) {
  const chars = createHash("sha256")
    // Same identity namespace as the pre-existing 14-course outline importer.
    .update(`skillup-aifs-outline-v1:${value}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  chars[12] = "4";
  chars[16] = "8";
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

const makeSlug = (value) =>
  value.toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

export function buildTeamFiveImportPlan(courses) {
  const check = validateTeamFiveCourseDrafts(courses);
  if (check.issues.length) {
    throw new Error(`Unreviewable AI-first content: ${check.issues.join("; ")}`);
  }
  const canonical = JSON.stringify(courses);
  return {
    ...check.stats,
    courses,
    sha256: createHash("sha256").update(canonical).digest("hex"),
    state: "draft",
    publicationAllowed: false,
  };
}

const requireOne = async (db, query, values, label) => {
  const result = await db.query(query, values);
  const first = result.rows[0];
  if (!first) throw new Error(`Missing ${label}; import rolled back.`);
  return first;
};

function expectedPrivate(question) {
  return question.type === "true_false"
    ? { correctOptionKey: question.answer ? "true" : "false" }
    : { correctOptionKeys: [question.answer] };
}

async function createNewDraftHierarchy(db, course, courseIndex, categoryId) {
  const slug = course.courseSlug;
  const skillId = stableTeamFiveId(`${slug}:skill`);
  const pathId = stableTeamFiveId(`${slug}:path`);
  const pathVersionId = stableTeamFiveId(`${slug}:path:v1`);
  await db.query(
    "insert into skills (id, slug, status, default_locale) values ($1, $2, 'draft', 'en')",
    [skillId, slug],
  );
  await db.query(
    `insert into skill_versions
      (id, skill_id, version, locale, title, summary, status)
      values ($1, $2, 1, 'en', $3, $4, 'draft')`,
    [
      stableTeamFiveId(`${slug}:skill:v1`),
      skillId,
      course.publicTitle,
      `Unreviewed 24-level educational course: ${course.publicTitle}. AI-assisted subject and language checks are still required.`,
    ],
  );
  await db.query(
    "insert into learning_paths (id, skill_id, slug, status, sort_order) values ($1, $2, $3, 'draft', $4)",
    [pathId, skillId, slug, 450 + courseIndex * 10],
  );
  await db.query(
    `insert into learning_path_versions
       (id, learning_path_id, version, locale, title, summary, estimated_minutes, status)
       values ($1, $2, 1, 'en', $3, $4, 192, 'draft')`,
    [
      pathVersionId, pathId, course.publicTitle,
      `A draft skills course with original instructional exercises and a practical capstone in ${course.publicTitle}. Publication requires independent human review.`,
    ],
  );
  const place = await requireOne(
    db,
    "select coalesce(max(sort_order),0)::int + 10 as n from skill_category_memberships where category_id = $1",
    [categoryId],
    "category sort position",
  );
  await db.query(
    "insert into skill_category_memberships (category_id, skill_id, sort_order) values ($1, $2, $3)",
    [categoryId, skillId, place.n],
  );
  let previousLevelId = null;
  for (const mod of course.modules) {
    const moduleId = stableTeamFiveId(`${slug}:module:${mod.moduleNumber}`);
    const moduleVersionId = stableTeamFiveId(`${slug}:module:${mod.moduleNumber}:v1`);
    await db.query(
      "insert into learning_modules (id, learning_path_id, slug, sort_order) values ($1,$2,$3,$4)",
      [moduleId, pathId, makeSlug(mod.moduleTitle), mod.moduleNumber * 10],
    );
    await db.query(
      `insert into learning_module_versions
        (id, module_id, learning_path_version_id, version, locale, title, summary, state, index_policy)
        values ($1, $2, $3, 1, 'en', $4, $5, 'draft', 'noindex')`,
      [
        moduleVersionId, moduleId, pathVersionId, mod.moduleTitle,
        `Unreviewed educational unit: ${mod.moduleTitle}. Six practical exercises-based lessons; publication and source review pending.`,
      ],
    );
    for (const level of mod.levels) {
      const lessonId = stableTeamFiveId(`${slug}:lesson:${level.number}`);
      const lessonVersionId = stableTeamFiveId(`${slug}:lesson:${level.number}:v1`);
      const levelId = stableTeamFiveId(`${slug}:level:${level.number}`);
      const levelVersionId = stableTeamFiveId(`${slug}:level:${level.number}:v1`);
      const levelSlug = makeSlug(level.title);
      await db.query(
        "insert into lessons (id, module_id, slug, sort_order) values ($1,$2,$3,$4)",
        [lessonId, moduleId, `${levelSlug}-lesson`, (level.number - 1) % 6 + 1],
      );
      await db.query(
        `insert into lesson_versions
          (id, lesson_id, module_version_id, version, locale, title, summary, estimated_minutes, state, index_policy)
          values ($1, $2, $3, 1, 'en', $4, $5, 8, 'draft', 'noindex')`,
        [lessonVersionId, lessonId, moduleVersionId, level.title, level.objective],
      );
      await db.query(
        "insert into levels (id, lesson_id, slug, sort_order) values ($1,$2,$3,1)",
        [levelId, lessonId, levelSlug],
      );
      await db.query(
        `insert into level_versions
         (id, level_id, lesson_version_id, version, locale, title, public_summary,
          instructions, estimated_minutes, state, index_policy)
         values ($1, $2, $3, 1, 'en', $4, $5, $6, 8, 'draft', 'noindex')`,
        [levelVersionId, levelId, lessonVersionId, level.title, level.objective,
          `${level.teaching} Then complete three original exercises; use the worked example and hint if needed.`],
      );
      await db.query(
        `insert into learning_objectives
         (id, level_version_id, code, statement, assessable, sort_order)
         values ($1, $2, $3, $4, true, 1)`,
        [
          stableTeamFiveId(`${slug}:objective:${level.number}`),
          levelVersionId,
          `AIFS_M${String(mod.moduleNumber).padStart(2, "0")}_L${String((level.number - 1) % 6 + 1).padStart(2, "0")}`,
          level.objective,
        ],
      );
      await db.query(
        `insert into content_source_references
         (id, level_version_id, kind, title, locator, sort_order)
         values ($1, $2, 'internal_editorial', $3, $4, 1)`,
        [
          stableTeamFiveId(`${slug}:source:${level.number}`),
          levelVersionId,
          "AI-assisted original lesson draft, independent factual and rights review pending",
          `docs/product/course-expansion/drafts/team-five/${slug}.json#level-${level.number}`,
        ],
      );
      if (previousLevelId) {
        await db.query(
          "insert into level_prerequisites (level_id, prerequisite_level_id) values ($1,$2)",
          [levelId, previousLevelId],
        );
      }
      previousLevelId = levelId;
    }
  }
  return { pathId, created: true };
}

async function verifyExistingDraftHierarchy(db, course, pathId) {
  const levels = await db.query(
    `select l.id as level_id, lv.id as level_version_id,
        lv.title, lv.state as level_state, lv.reviewed_at as level_reviewed,
        lesv.id as lesson_version_id, lesv.state as lesson_state,
        lesv.reviewed_at as lesson_reviewed, lesv.summary as lesson_summary,
        m.sort_order as module_order, les.sort_order as lesson_order
     from learning_modules m
     join lessons les on les.module_id = m.id
     join lesson_versions lesv on lesv.lesson_id = les.id
     join levels l on l.lesson_id = les.id
     join level_versions lv on lv.level_id = l.id
     where m.learning_path_id = $1
     order by m.sort_order, les.sort_order, lv.version`,
    [pathId],
  );
  const planned = course.modules.flatMap((mod) => mod.levels);
  if (
    levels.rows.length !== 24 ||
    levels.rows.some((row, i) =>
      row.title !== planned[i].title ||
      row.level_state !== "draft" ||
      row.lesson_state !== "draft" ||
      row.level_reviewed !== null ||
      row.lesson_reviewed !== null
    )
  ) {
    throw new Error(`${course.courseSlug}: an existing reviewed/published or nonmatching syllabus cannot be modified.`);
  }
  return levels.rows;
}

async function preflightPriorDraft(db, course) {
  const slug = course.courseSlug;
  const prior = await db.query(
    `select s.status, p.id as path_id, p.status as path_status
       from skills s join learning_paths p on p.skill_id = s.id
       where s.slug = $1 for update of s, p`,
    [slug],
  );
  if (!prior.rows[0]) return null;
  const row = prior.rows[0];
  if (row.status !== "draft" || row.path_status !== "draft") {
    throw new Error(`${slug}: refusing to touch a non-draft skill or path.`);
  }
  return row.path_id;
}

async function priorChallengeRows(db, pathId) {
  return (await db.query(
    `select cv.prompt, cv.type, cv.state, ce.private_evaluation
       from learning_modules m
       join lessons les on les.module_id = m.id
       join levels lv on lv.lesson_id = les.id
       join challenges c on c.level_id = lv.id
       join challenge_versions cv on cv.challenge_id = c.id
       join challenge_evaluations ce on ce.challenge_version_id = cv.id
       where m.learning_path_id = $1
       order by m.sort_order, les.sort_order, c.sort_order, cv.version`,
    [pathId],
  )).rows;
}

async function writeDraftChallenges(db, course, currentLevels) {
  const slug = course.courseSlug;
  const levels = course.modules.flatMap((mod) => mod.levels);
  const expected = levels.flatMap((level) => level.challenges);
  const existing = await priorChallengeRows(db, currentLevels.pathId);
  if (existing.length > 0) {
    if (
      existing.length === 72 &&
      existing.every((row, i) =>
        row.state === "draft" &&
        row.prompt === expected[i].prompt &&
        row.type === expected[i].type &&
        JSON.stringify(row.private_evaluation) === JSON.stringify(expectedPrivate(expected[i]))
      )
    ) return "already_imported";
    throw new Error(`${slug}: existing question versions conflict with this source; no silent overwrite.`);
  }
  const sourceRows = currentLevels.created
    ? await verifyExistingDraftHierarchy(db, course, currentLevels.pathId)
    : currentLevels.rows;
  for (const [levelIndex, level] of levels.entries()) {
    const row = sourceRows[levelIndex];
    const levelVersionId = row.level_version_id;
    const levelId = row.level_id;
    if (!currentLevels.created) {
      // Original outline placeholders are mutable only while completely unreviewed and unplayed.
      if (!row.lesson_summary.startsWith("Unreviewed lesson brief for ")) {
        throw new Error(`${slug}: refusing to replace an editor-modified lesson.`);
      }
      const lessonUpdate = await db.query(
        `update lesson_versions set summary = $2
           where id = $1 and state = 'draft' and reviewed_at is null
             and summary like 'Unreviewed lesson brief for %'`,
        [row.lesson_version_id, level.objective],
      );
      if (lessonUpdate.rowCount !== 1) throw new Error(`${slug}: lesson draft changed concurrently.`);
      const levelUpdate = await db.query(
        `update level_versions set public_summary = $2, instructions = $3
           where id = $1 and state = 'draft' and reviewed_at is null
             and public_summary like 'Draft-level learning goal:%'`,
        [levelVersionId, level.objective,
          `${level.teaching} Complete three practical exercises and review each explanation.`],
      );
      if (levelUpdate.rowCount !== 1) throw new Error(`${slug}: level draft changed concurrently.`);
      await db.query(
        `update learning_objectives set statement = $2 where level_version_id = $1
          and statement like 'Draft goal:%'`,
        [levelVersionId, level.objective],
      );
    }
    for (const [qi, question] of level.challenges.entries()) {
      const challengeId = stableTeamFiveId(`${slug}:challenge:${level.number}:${qi}`);
      const versionId = stableTeamFiveId(`${slug}:challenge:${level.number}:${qi}:v1`);
      await db.query(
        "insert into challenges (id, level_id, slug, sort_order) values ($1,$2,$3,$4)",
        [challengeId, levelId, `${makeSlug(level.title)}-practice-${qi + 1}`, qi + 1],
      );
      await db.query(
        `insert into challenge_versions
         (id, challenge_id, level_version_id, version, locale, type, prompt,
          instruction, explanation, public_payload, points, state)
         values ($1, $2, $3, 1, 'en', $4, $5, $6, $7, $8::jsonb, 10, 'draft')`,
        [
          versionId, challengeId, levelVersionId, question.type, question.prompt,
          question.type === "true_false" ? "Choose true or false." : "Choose the most accurate answer.",
          question.feedback,
          JSON.stringify(question.type === "multiple_choice" ? { selectionLimit: 1 } : {}),
        ],
      );
      const options = question.type === "true_false"
        ? [["true", "True"], ["false", "False"]]
        : Object.entries(question.options);
      for (const [optionIndex, [key, label]] of options.entries()) {
        await db.query(
          `insert into challenge_answer_options
           (id, challenge_version_id, option_key, label, sort_order)
           values ($1, $2, $3, $4, $5)`,
          [
            stableTeamFiveId(`${slug}:option:${level.number}:${qi}:${key}`),
            versionId, key, label, optionIndex + 1,
          ],
        );
      }
      await db.query(
        `insert into challenge_evaluations
          (challenge_version_id, evaluator, private_evaluation)
          values ($1, 'deterministic_v1', $2::jsonb)`,
        [versionId, JSON.stringify(expectedPrivate(question))],
      );
      await db.query(
        `insert into content_source_references
         (id, challenge_version_id, kind, title, locator, sort_order)
         values ($1, $2, 'internal_editorial', $3, $4, 1)`,
        [
          stableTeamFiveId(`${slug}:challenge-source:${level.number}:${qi}`),
          versionId,
          "Original AI-assisted educational question; reviewer fact-check required",
          `docs/product/course-expansion/drafts/team-five/${slug}.json#level-${level.number}-challenge-${qi + 1}`,
        ],
      );
    }
  }
  return "imported";
}

export async function importTeamFiveDrafts(db, plan) {
  if (
    plan.courses.length !== 5 ||
    plan.levels !== 120 ||
    plan.challenges !== 360 ||
    plan.publicationAllowed !== false
  ) throw new Error("Incomplete or unsafe five-course draft import plan.");
  await db.query("select pg_advisory_xact_lock(hashtext($1))", ["aifs:team-five:full-drafts-v1"]);
  let imported = 0;
  let existing = 0;
  for (const [index, course] of plan.courses.entries()) {
    const pathId = await preflightPriorDraft(db, course);
    const categorySlug = course.courseSlug === "sales-client-negotiation"
      ? "business"
      : "digital-skills";
    const category = pathId
      ? null
      : await requireOne(
        db,
        "select id from skill_categories where slug = $1 for update",
        [categorySlug],
        `seeded ${categorySlug} category`,
      );
    const path = pathId
      ? { pathId, created: false, rows: await verifyExistingDraftHierarchy(db, course, pathId) }
      : await createNewDraftHierarchy(db, course, index, category.id);
    const result = await writeDraftChallenges(db, course, path);
    if (result === "imported") imported++;
    else existing++;
  }
  const verified = await db.query(
    `select
      count(distinct s.id)::int as courses,
      count(distinct l.id)::int as levels,
      count(distinct cv.id)::int as challenges,
      count(distinct case when lv.state = 'published' or cv.state = 'published' then l.id end)::int as published
      from skills s
      join learning_paths p on p.skill_id = s.id
      join learning_modules m on m.learning_path_id = p.id
      join lessons les on les.module_id = m.id
      join levels l on l.lesson_id = les.id
      join level_versions lv on lv.level_id = l.id
      join challenges c on c.level_id = l.id
      join challenge_versions cv on cv.challenge_id = c.id
      where s.slug = any($1::text[])`,
    [plan.courses.map((course) => course.courseSlug)],
  );
  const counts = verified.rows[0];
  if (
    counts?.courses !== 5 || counts.levels !== 120 ||
    counts.challenges !== 360 || counts.published !== 0
  ) throw new Error(`Unsafe draft import: ${JSON.stringify(counts)}`);
  return { imported, alreadyImported: existing, ...counts };
}

async function main() {
  const mode = assertTeamFiveDraftImportPermission(process.env, process.argv.slice(2));
  const plan = buildTeamFiveImportPlan(readTeamFiveCourseDrafts());
  if (mode === "dry_run") {
    console.info(`Dry-run: ${plan.courses.length} skills, ${plan.modules} modules, ${plan.levels} lessons, ${plan.challenges} evaluated drafts, ${plan.capstones} capstones; digest ${plan.sha256}; zero DB writes. PUBLIC repo keys must be independently re-keyed before any approval or release.`);
    return;
  }
  // Import TS DB runtime only after permission and dry-run validation.
  const { createDatabaseClient, requireDatabaseUrl } = await import("../packages/database/src/index.ts");
  const client = createDatabaseClient({
    connectionString: requireDatabaseUrl(),
    applicationName: "skillup-aifs-team-five-draft-import",
    maxConnections: 1,
  });
  const db = await client.pool.connect();
  try {
    await db.query("begin");
    const result = await importTeamFiveDrafts(db, plan);
    await db.query("commit");
    console.info(`Nonproduction draft import succeeded: ${JSON.stringify(result)}; zero published versions. All evaluator keys require independent protected replacement before release.`);
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
    await client.close();
  }
}

if (process.argv[1]?.endsWith("import-aifs-team-five-drafts.mjs")) {
  await main();
}
