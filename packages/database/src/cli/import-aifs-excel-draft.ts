import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";

import { createDatabaseClient, requireDatabaseUrl } from "../index.js";

type ExcelOption = "a" | "b" | "c";

type ExcelQuestion = Readonly<{
  type: "multiple_choice" | "scenario" | "true_false";
  prompt: string;
  feedback: string;
  options?: Readonly<Record<ExcelOption, string>>;
  answer: ExcelOption | boolean;
}>;

type ExcelLevel = Readonly<{
  number: number;
  title: string;
  objective: string;
  teaching: string;
  challenges: readonly ExcelQuestion[];
}>;

type ExcelModule = Readonly<{
  schemaVersion: 1;
  courseSlug: "excel-google-sheets-work";
  locale: "en";
  moduleNumber: number;
  moduleTitle: string;
  state: "draft";
  reviewedBy: null;
  approvedBy: null;
  publishedAt: null;
  levels: readonly ExcelLevel[];
}>;

const slug = (value: string) =>
  value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

function stableUuid(input: string): string {
  const chars = createHash("sha256")
    .update(`skillup-aifs-draft-v1:${input}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  chars[12] = "4";
  chars[16] = "8";
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

export function loadAndValidateExcelDraft(): Readonly<{
  modules: readonly ExcelModule[];
  sha256: string;
  levels: number;
  challenges: number;
}> {
  const texts = Array.from({ length: 4 }, (_, index) => {
    const file = new URL(
      `../../../../docs/product/course-expansion/drafts/excel/module-0${index + 1}.json`,
      import.meta.url,
    );
    return readFileSync(file, "utf8");
  });
  const raw = texts.map((entry) => JSON.parse(entry) as ExcelModule);
  const uniquePrompts = new Set<string>();
  const uniqueTitles = new Set<string>();
  let totalLevels = 0;
  let totalChallenges = 0;
  for (const [moduleIndex, module] of raw.entries()) {
    if (
      module.schemaVersion !== 1 ||
      module.courseSlug !== "excel-google-sheets-work" ||
      module.locale !== "en" ||
      module.moduleNumber !== moduleIndex + 1 ||
      module.state !== "draft" ||
      module.reviewedBy !== null ||
      module.approvedBy !== null ||
      module.publishedAt !== null ||
      !Array.isArray(module.levels) ||
      module.levels.length !== 6 ||
      typeof module.moduleTitle !== "string"
    ) {
      throw new Error(`Unapproved or incomplete Excel module ${moduleIndex + 1}.`);
    }
    for (const [index, level] of module.levels.entries()) {
      totalLevels += 1;
      if (
        level.number !== moduleIndex * 6 + index + 1 ||
        !level.objective ||
        level.objective.length < 35 ||
        !level.teaching ||
        level.teaching.length < 75 ||
        !level.title ||
        uniqueTitles.has(level.title) ||
        !Array.isArray(level.challenges) ||
        level.challenges.length !== 3
      ) {
        throw new Error(`Invalid or repeated Excel level ${level.number}.`);
      }
      uniqueTitles.add(level.title);
      const formats = new Set<string>();
      for (const question of level.challenges) {
        totalChallenges += 1;
        if (
          !["multiple_choice", "scenario", "true_false"].includes(question.type) ||
          typeof question.prompt !== "string" ||
          question.prompt.length < 35 ||
          uniquePrompts.has(question.prompt.toLowerCase()) ||
          typeof question.feedback !== "string" ||
          question.feedback.length < 40
        ) {
          throw new Error(`Unreviewable or repeated question in level ${level.number}.`);
        }
        formats.add(question.type);
        uniquePrompts.add(question.prompt.toLowerCase());
        if (question.type === "true_false") {
          if (typeof question.answer !== "boolean") {
            throw new Error(`Invalid true/false key in level ${level.number}.`);
          }
        } else if (
          typeof question.answer !== "string" ||
          !["a", "b", "c"].includes(question.answer) ||
          !question.options ||
          Object.keys(question.options).length !== 3 ||
          new Set(Object.values(question.options)).size !== 3 ||
          !Object.values(question.options).every(
            (value) => typeof value === "string" && value.length > 0,
          )
        ) {
          throw new Error(`Invalid multiple choice answer options in level ${level.number}.`);
        }
      }
      if (formats.size !== 3) throw new Error(`Level ${level.number} must mix three formats.`);
    }
  }
  if (totalLevels !== 24 || totalChallenges !== 72) {
    throw new Error("The complete, unique 24-level/72-challenge Excel draft is required.");
  }
  return {
    modules: raw,
    sha256: createHash("sha256").update(texts.join("\n---module---\n")).digest("hex"),
    levels: totalLevels,
    challenges: totalChallenges,
  };
}

export function assertDraftImportPermission(
  env: NodeJS.ProcessEnv,
  args: readonly string[],
): "dry_run" | "apply_draft" {
  if (
    args.length > 1 ||
    (args.length === 1 && !["--dry-run", "--apply-draft"].includes(args[0] ?? ""))
  ) {
    throw new Error("Only --dry-run or --apply-draft is supported.");
  }
  const apply = args[0] === "--apply-draft";
  if (!apply) return "dry_run";
  if (!["test", "development", "staging"].includes(env["APP_ENV"] ?? "")) {
    throw new Error(
      "AIFS draft imports are forbidden outside explicit test/development/staging APP_ENV.",
    );
  }
  if (env["AIFS_ALLOW_DRAFT_IMPORT"] !== "yes") {
    throw new Error("Explicit AIFS_ALLOW_DRAFT_IMPORT=yes is required for draft DB writes.");
  }
  return "apply_draft";
}

export async function importDraft(
  database: PoolClient,
  modules: readonly ExcelModule[],
): Promise<"imported" | "already_imported"> {
  const skillSlug = "excel-google-sheets-work";
  const skillId = stableUuid("skill");
  const skillVersionId = stableUuid("skill:v1");
  const pathId = stableUuid("path");
  const pathVersionId = stableUuid("path:v1");
  await database.query("select pg_advisory_xact_lock(hashtext($1))", [`aifs-draft:${skillSlug}`]);

  const prior = await database.query<{ status: string }>(
    "select status from skills where slug = $1 for update",
    [skillSlug],
  );
  if (prior.rows[0]) {
    if (prior.rows[0].status !== "draft") {
      throw new Error("AIFS cannot touch a published, reviewed or otherwise non-draft course.");
    }
    const rows = await database.query<{ prompt: string; state: string }>(
      `select cv.prompt, cv.state
         from learning_paths lp
         join learning_modules m on m.learning_path_id = lp.id
         join lessons les on les.module_id = m.id
         join levels l on l.lesson_id = les.id
         join challenges c on c.level_id = l.id
         join challenge_versions cv on cv.challenge_id = c.id
         where lp.slug = $1
         order by m.sort_order, les.sort_order, c.sort_order`,
      [skillSlug],
    );
    const expected = modules.flatMap((module) =>
      module.levels.flatMap((level) => level.challenges.map((question) => question.prompt)),
    );
    if (
      rows.rows.length === expected.length &&
      rows.rows.every((row, index) => row.state === "draft" && row.prompt === expected[index])
    ) {
      return "already_imported";
    }
    throw new Error("An existing draft differs from this manifest; do not mutate it silently.");
  }

  const category = await database.query<{ id: string }>(
    "select id from skill_categories where slug = 'digital-skills' for update",
  );
  const categoryId = category.rows[0]?.id;
  if (!categoryId) {
    throw new Error("The reviewed digital-skills category must be seeded before draft import.");
  }

  await database.query(
    "insert into skills (id, slug, status, default_locale) values ($1, $2, 'draft', 'en')",
    [skillId, skillSlug],
  );
  await database.query(
    `insert into skill_versions
      (id, skill_id, version, locale, title, summary, status)
      values ($1, $2, 1, 'en', $3, $4, 'draft')`,
    [
      skillVersionId,
      skillId,
      "Excel & Google Sheets for Work",
      "Clean business data, use useful formulas, interpret fair charts and build an original sales and expense tracking workbook.",
    ],
  );

  await database.query(
    `insert into learning_paths
      (id, skill_id, slug, status, sort_order)
      values ($1, $2, $3, 'draft', 90)`,
    [pathId, skillId, skillSlug],
  );
  await database.query(
    `insert into learning_path_versions
      (id, learning_path_id, version, locale, title, summary, estimated_minutes, status)
      values ($1, $2, 1, 'en', $3, $4, 192, 'draft')`,
    [
      pathVersionId,
      pathId,
      "Excel & Google Sheets for Work",
      "Learn spreadsheet fundamentals through real business examples and build a reusable sales, expense and reporting tracker.",
    ],
  );
  const order = await database.query<{ next_order: number }>(
    "select coalesce(max(sort_order), 0)::int + 10 as next_order from skill_category_memberships where category_id = $1",
    [categoryId],
  );
  await database.query(
    "insert into skill_category_memberships (category_id, skill_id, sort_order) values ($1, $2, $3)",
    [categoryId, skillId, order.rows[0]?.next_order ?? 100],
  );

  let priorLevelId: string | null = null;
  for (const module of modules) {
    const moduleSlug = slug(module.moduleTitle);
    const moduleId = stableUuid(`module:${moduleSlug}`);
    const moduleVersionId = stableUuid(`module:${moduleSlug}:v1`);
    await database.query(
      "insert into learning_modules (id, learning_path_id, slug, sort_order) values ($1, $2, $3, $4)",
      [moduleId, pathId, moduleSlug, module.moduleNumber * 10],
    );
    await database.query(
      `insert into learning_module_versions
        (id, module_id, learning_path_version_id, version, locale, title, summary, state, index_policy)
        values ($1, $2, $3, 1, 'en', $4, $5, 'draft', 'noindex')`,
      [
        moduleVersionId,
        moduleId,
        pathVersionId,
        module.moduleTitle,
        `Practice real spreadsheet skills in ${module.moduleTitle} using fictional shop data and measurable outcomes.`,
      ],
    );

    for (const [index, level] of module.levels.entries()) {
      const levelSlug = slug(level.title);
      const lessonSlug = `${levelSlug}-lesson`;
      const lessonId = stableUuid(`lesson:${level.number}`);
      const lessonVersionId = stableUuid(`lesson:${level.number}:v1`);
      const levelId = stableUuid(`level:${level.number}`);
      const levelVersionId = stableUuid(`level:${level.number}:v1`);
      await database.query(
        "insert into lessons (id, module_id, slug, sort_order) values ($1, $2, $3, $4)",
        [lessonId, moduleId, lessonSlug, index + 1],
      );
      await database.query(
        `insert into lesson_versions
          (id, lesson_id, module_version_id, version, locale, title, summary, estimated_minutes, state, index_policy)
          values ($1, $2, $3, 1, 'en', $4, $5, 8, 'draft', 'noindex')`,
        [lessonVersionId, lessonId, moduleVersionId, level.title, level.teaching],
      );
      await database.query(
        "insert into levels (id, lesson_id, slug, sort_order) values ($1, $2, $3, 1)",
        [levelId, lessonId, levelSlug],
      );
      await database.query(
        `insert into level_versions
          (id, level_id, lesson_version_id, version, locale, title, public_summary,
           instructions, estimated_minutes, state, index_policy)
          values ($1, $2, $3, 1, 'en', $4, $5, $6, 8, 'draft', 'noindex')`,
        [
          levelVersionId,
          levelId,
          lessonVersionId,
          level.title,
          level.objective,
          `${level.teaching} Complete all three original exercises to check understanding before progressing.`,
        ],
      );
      await database.query(
        `insert into learning_objectives
          (id, level_version_id, code, statement, assessable, sort_order)
          values ($1, $2, $3, $4, true, 1)`,
        [
          stableUuid(`objective:${level.number}`),
          levelVersionId,
          `EXCEL_M${String(module.moduleNumber).padStart(2, "0")}_L${String(index + 1).padStart(2, "0")}`,
          level.objective,
        ],
      );
      await database.query(
        `insert into content_source_references
          (id, level_version_id, kind, title, locator, sort_order)
          values ($1, $2, 'internal_editorial', $3, $4, 1)`,
        [
          stableUuid(`source:${level.number}`),
          levelVersionId,
          "AI-assisted original draft, editorial review pending",
          `docs/product/course-expansion/drafts/excel/module-0${module.moduleNumber}.json#level-${level.number}`,
        ],
      );
      if (priorLevelId) {
        await database.query(
          "insert into level_prerequisites (level_id, prerequisite_level_id) values ($1, $2)",
          [levelId, priorLevelId],
        );
      }
      priorLevelId = levelId;

      for (const [questionIndex, question] of level.challenges.entries()) {
        const challengeSlug = `${levelSlug}-practice-${questionIndex + 1}`;
        const challengeId = stableUuid(`challenge:${level.number}:${questionIndex}`);
        const challengeVersionId = stableUuid(`challenge:${level.number}:${questionIndex}:v1`);
        const publicPayload = question.type === "multiple_choice" ? { selectionLimit: 1 } : {};
        const privateEvaluation =
          question.type === "true_false"
            ? { correctOptionKey: question.answer ? "true" : "false" }
            : { correctOptionKeys: [question.answer] };
        await database.query(
          `insert into challenges (id, level_id, slug, sort_order)
           values ($1, $2, $3, $4)`,
          [challengeId, levelId, challengeSlug, questionIndex + 1],
        );
        await database.query(
          `insert into challenge_versions
            (id, challenge_id, level_version_id, version, locale, type, prompt,
             instruction, explanation, public_payload, points, state)
            values ($1, $2, $3, 1, 'en', $4, $5, $6, $7, $8::jsonb, 10, 'draft')`,
          [
            challengeVersionId,
            challengeId,
            levelVersionId,
            question.type,
            question.prompt,
            question.type === "true_false"
              ? "Choose true or false."
              : "Choose the most accurate answer.",
            question.feedback,
            JSON.stringify(publicPayload),
          ],
        );
        const options =
          question.type === "true_false"
            ? [
                ["true", "True"],
                ["false", "False"],
              ]
            : Object.entries(question.options ?? {});
        for (const [optionIndex, option] of options.entries()) {
          await database.query(
            `insert into challenge_answer_options
              (id, challenge_version_id, option_key, label, sort_order)
              values ($1, $2, $3, $4, $5)`,
            [
              stableUuid(`option:${level.number}:${questionIndex}:${option[0]}`),
              challengeVersionId,
              option[0],
              option[1],
              optionIndex + 1,
            ],
          );
        }
        await database.query(
          `insert into challenge_evaluations
            (challenge_version_id, evaluator, private_evaluation)
            values ($1, 'deterministic_v1', $2::jsonb)`,
          [challengeVersionId, JSON.stringify(privateEvaluation)],
        );
      }
    }
  }
  const counts = await database.query<{ levels: number; challenges: number; published: number }>(
    `select
      (select count(*)::int from levels l join lessons les on les.id = l.lesson_id
        join learning_modules m on m.id = les.module_id where m.learning_path_id = $1) as levels,
      (select count(*)::int from challenges c join levels l on l.id = c.level_id
        join lessons les on les.id = l.lesson_id
        join learning_modules m on m.id = les.module_id where m.learning_path_id = $1) as challenges,
      (select count(*)::int from level_versions lv join levels l on l.id = lv.level_id
        join lessons les on les.id = l.lesson_id
        join learning_modules m on m.id = les.module_id where m.learning_path_id = $1
        and lv.state = 'published') as published`,
    [pathId],
  );
  if (
    counts.rows[0]?.levels !== 24 ||
    counts.rows[0]?.challenges !== 72 ||
    counts.rows[0]?.published !== 0
  ) {
    throw new Error("Incomplete or unexpectedly public draft import: transaction rolled back.");
  }
  return "imported";
}

async function main(): Promise<void> {
  const mode = assertDraftImportPermission(process.env, process.argv.slice(2));
  const draft = loadAndValidateExcelDraft();
  if (mode === "dry_run") {
    console.info(
      `Dry-run validated: ${draft.modules.length} modules, ${draft.levels} levels, ${draft.challenges} draft exercises; SHA256 ${draft.sha256}; no database connection or publication.`,
    );
    return;
  }
  const client = createDatabaseClient({
    connectionString: requireDatabaseUrl(),
    applicationName: "skillup-aifs-excel-draft-import",
    maxConnections: 1,
  });
  const database = await client.pool.connect();
  try {
    await database.query("begin");
    const action = await importDraft(database, draft.modules);
    await database.query("commit");
    console.info(
      `Excel course ${action}: 24 original draft levels, 72 private-key challenges, SHA256 ${draft.sha256}. Published content unchanged.`,
    );
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
    await client.close();
  }
}

if (process.argv[1]?.endsWith("import-aifs-excel-draft.ts")) {
  await main();
}
