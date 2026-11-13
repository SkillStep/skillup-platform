import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";

import { createDatabaseClient, requireDatabaseUrl } from "../index.js";

type ModuleOutline = Readonly<{
  moduleNumber: number;
  moduleTitle: string;
  objective: string;
  levelTitles: readonly string[];
  exampleScenario: string;
  reviewStatus: "subject_review_pending";
}>;

type CourseOutline = Readonly<{
  schemaVersion: 1;
  courseSlug: string;
  courseTitle: string;
  locale: "en";
  state: "outline_draft";
  publicationAllowed: false;
  reviewedBy: null;
  publishedAt: null;
  modules: readonly ModuleOutline[];
}>;

type CourseScope = Readonly<{
  slug: string;
  title: string;
  wave: number;
  category: string;
  learningOutcome: string;
  capstoneDeliverable: string;
  proposedStatus: "draft_not_for_publication";
}>;

type ImportPlan = Readonly<{
  courses: readonly Readonly<{ scope: CourseScope; outline: CourseOutline }>[];
  sha256: string;
  moduleCount: number;
  levelCount: number;
}>;

const isSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const makeSlug = (value: string) =>
  value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

function stableUuid(value: string): string {
  const chars = createHash("sha256")
    .update(`skillup-aifs-outline-v1:${value}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  chars[12] = "4";
  chars[16] = "8";
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

export function loadAndValidateDraftCourseOutlines(): ImportPlan {
  const root = new URL("../../../../docs/product/course-expansion/", import.meta.url);
  const manifestText = readFileSync(new URL("catalog-plan-v1.json", root), "utf8");
  const manifest = JSON.parse(manifestText) as {
    courses: readonly CourseScope[];
    publicationPolicy: string;
  };
  if (
    manifest.publicationPolicy !== "planning_only_no_auto_publish" ||
    !Array.isArray(manifest.courses) ||
    manifest.courses.length !== 15
  ) {
    throw new Error("The reviewed 15-course planning scope is required; auto-publication forbidden.");
  }
  const included = manifest.courses.filter((course) => course.slug !== "excel-google-sheets-work");
  if (included.length !== 14) throw new Error("Expected 14 outlines (the Excel draft has its own importer).");

  const seenCourses = new Set<string>();
  const outlineTexts: string[] = [];
  const courses = included.map((scope) => {
    if (
      !isSlug(scope.slug) ||
      !isSlug(scope.category) ||
      seenCourses.has(scope.slug) ||
      scope.proposedStatus !== "draft_not_for_publication" ||
      !scope.title ||
      !scope.learningOutcome ||
      !scope.capstoneDeliverable
    ) {
      throw new Error(`Invalid, duplicate or incorrectly approved course scope: ${scope.slug}.`);
    }
    seenCourses.add(scope.slug);
    const text = readFileSync(new URL(`outlines/${scope.slug}.json`, root), "utf8");
    outlineTexts.push(text);
    const outline = JSON.parse(text) as CourseOutline;
    if (
      outline.schemaVersion !== 1 ||
      outline.courseSlug !== scope.slug ||
      outline.courseTitle !== scope.title ||
      outline.locale !== "en" ||
      outline.state !== "outline_draft" ||
      outline.publicationAllowed !== false ||
      outline.reviewedBy !== null ||
      outline.publishedAt !== null ||
      !Array.isArray(outline.modules) ||
      outline.modules.length !== 4
    ) {
      throw new Error(`Unreviewed syllabus scope misaligned: ${scope.slug}.`);
    }
    const seenTitles = new Set<string>();
    for (const [index, module] of outline.modules.entries()) {
      if (
        module.moduleNumber !== index + 1 ||
        !module.moduleTitle ||
        module.objective.length < 12 ||
        module.reviewStatus !== "subject_review_pending" ||
        !Array.isArray(module.levelTitles) ||
        module.levelTitles.length !== 6
      ) {
        throw new Error(`Invalid draft-only module ${scope.slug}/${index + 1}.`);
      }
      for (const title of module.levelTitles) {
        if (
          typeof title !== "string" ||
          title.length < 16 ||
          seenTitles.has(title.toLowerCase()) ||
          !makeSlug(title)
        ) {
          throw new Error(`Duplicate or incomplete syllabus level ${scope.slug}: ${title}.`);
        }
        seenTitles.add(title.toLowerCase());
      }
    }
    if (seenTitles.size !== 24) throw new Error(`Missing proposed level in ${scope.slug}.`);
    return { scope, outline };
  });
  return {
    courses,
    sha256: createHash("sha256").update([manifestText, ...outlineTexts].join("\n")).digest("hex"),
    moduleCount: 56,
    levelCount: 336,
  };
}

export function assertDraftOutlineImportPermission(
  env: NodeJS.ProcessEnv,
  args: readonly string[],
): "dry_run" | "apply_draft" {
  if (
    args.length > 1 ||
    (args.length === 1 && !["--dry-run", "--apply-draft"].includes(args[0] ?? ""))
  ) {
    throw new Error("Only --dry-run or --apply-draft is supported; publishing is not supported.");
  }
  if (args[0] !== "--apply-draft") return "dry_run";
  if (!["test", "development", "staging"].includes(env["APP_ENV"] ?? "")) {
    throw new Error("AIFS draft outline imports are forbidden in production or unknown environments.");
  }
  if (env["AIFS_ALLOW_DRAFT_IMPORT"] !== "yes") {
    throw new Error("AIFS_ALLOW_DRAFT_IMPORT=yes is required before any draft DB write.");
  }
  return "apply_draft";
}

async function ensureDraftCategory(database: PoolClient, slug: string): Promise<string> {
  const category = await database.query<{ id: string }>(
    "select id from skill_categories where slug = $1 for update",
    [slug],
  );
  if (category.rows[0]?.id) return category.rows[0].id;
  if (slug !== "life-skills") throw new Error(`Seed the missing existing category ${slug} first.`);

  const categoryId = stableUuid("category:life-skills");
  await database.query(
    "insert into skill_categories (id, slug, default_locale, sort_order) values ($1, $2, 'en', 90)",
    [categoryId, slug],
  );
  await database.query(
    `insert into skill_category_versions
      (id, category_id, version, locale, title, summary, state, index_policy)
     values ($1, $2, 1, 'en', 'Life Skills',
       'Draft learning category for practical budgeting and everyday decisions, pending authorized editorial review.',
       'draft', 'noindex')`,
    [stableUuid("category:life-skills:v1"), categoryId],
  );
  return categoryId;
}

async function importOneDraft(
  database: PoolClient,
  entry: Readonly<{ scope: CourseScope; outline: CourseOutline }>,
): Promise<"imported" | "already_imported"> {
  const { scope, outline } = entry;
  const existing = await database.query<{ status: string }>(
    "select status from skills where slug = $1 for update",
    [scope.slug],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].status !== "draft") {
      throw new Error(`Refusing to overwrite non-draft course ${scope.slug}.`);
    }
    const current = await database.query<{ title: string; state: string }>(
      `select lv.title, lv.state from learning_paths p
       join learning_modules m on m.learning_path_id = p.id
       join lessons les on les.module_id = m.id
       join levels l on l.lesson_id = les.id
       join level_versions lv on lv.level_id = l.id
       where p.slug = $1 order by m.sort_order, les.sort_order, lv.version`,
      [scope.slug],
    );
    const expected = outline.modules.flatMap((module) => module.levelTitles);
    if (
      current.rows.length === expected.length &&
      current.rows.every((row, index) => row.state === "draft" && row.title === expected[index])
    ) {
      return "already_imported";
    }
    throw new Error(`Course ${scope.slug} already exists but differs from immutable draft scope.`);
  }

  const categoryId = await ensureDraftCategory(database, scope.category);
  const skillId = stableUuid(`${scope.slug}:skill`);
  const pathId = stableUuid(`${scope.slug}:path`);
  const pathVersionId = stableUuid(`${scope.slug}:path:v1`);
  await database.query(
    "insert into skills (id, slug, status, default_locale) values ($1, $2, 'draft', 'en')",
    [skillId, scope.slug],
  );
  await database.query(
    `insert into skill_versions
     (id, skill_id, version, locale, title, summary, status)
     values ($1, $2, 1, 'en', $3, $4, 'draft')`,
    [
      stableUuid(`${scope.slug}:skill:v1`),
      skillId,
      scope.title,
      `Unreviewed draft syllabus: ${scope.learningOutcome}. Not yet playable or published.`,
    ],
  );
  await database.query(
    `insert into learning_paths (id, skill_id, slug, status, sort_order)
     values ($1, $2, $3, 'draft', $4)`,
    [pathId, skillId, scope.slug, 100 + scope.wave * 20],
  );
  await database.query(
    `insert into learning_path_versions
     (id, learning_path_id, version, locale, title, summary, estimated_minutes, status)
     values ($1, $2, 1, 'en', $3, $4, 192, 'draft')`,
    [
      pathVersionId,
      pathId,
      scope.title,
      `Draft outline only: ${scope.capstoneDeliverable}. No lessons have been approved for learners.`,
    ],
  );
  const position = await database.query<{ next_order: number }>(
    "select coalesce(max(sort_order), 0)::int + 10 as next_order from skill_category_memberships where category_id = $1",
    [categoryId],
  );
  await database.query(
    "insert into skill_category_memberships (category_id, skill_id, sort_order) values ($1, $2, $3)",
    [categoryId, skillId, position.rows[0]?.next_order ?? 100],
  );

  let previous: string | null = null;
  for (const module of outline.modules) {
    const moduleSlug = makeSlug(module.moduleTitle);
    const moduleId = stableUuid(`${scope.slug}:module:${module.moduleNumber}`);
    const moduleVersionId = stableUuid(`${scope.slug}:module:${module.moduleNumber}:v1`);
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
        `Draft module scope awaiting subject review: ${module.objective}. This is not finished instruction.`,
      ],
    );
    for (const [index, title] of module.levelTitles.entries()) {
      const number = (module.moduleNumber - 1) * 6 + index + 1;
      const levelSlug = makeSlug(title);
      const lessonId = stableUuid(`${scope.slug}:lesson:${number}`);
      const lessonVersionId = stableUuid(`${scope.slug}:lesson:${number}:v1`);
      const levelId = stableUuid(`${scope.slug}:level:${number}`);
      const levelVersionId = stableUuid(`${scope.slug}:level:${number}:v1`);
      await database.query(
        "insert into lessons (id, module_id, slug, sort_order) values ($1, $2, $3, $4)",
        [lessonId, moduleId, `${levelSlug}-lesson`, index + 1],
      );
      await database.query(
        `insert into lesson_versions
          (id, lesson_id, module_version_id, version, locale, title, summary,
           estimated_minutes, state, index_policy)
         values ($1, $2, $3, 1, 'en', $4, $5, 8, 'draft', 'noindex')`,
        [
          lessonVersionId,
          lessonId,
          moduleVersionId,
          title,
          `Unreviewed lesson brief for ${title}; subject-specific instructional examples and assessments are pending.`,
        ],
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
          title,
          `Draft-level learning goal: ${module.objective}. Specific assessment not yet authored.`,
          "This is an unreviewed curriculum position. Original examples, accessible exercises and private answer evaluations must be created and independently verified before publishing.",
        ],
      );
      await database.query(
        `insert into learning_objectives
         (id, level_version_id, code, statement, assessable, sort_order)
         values ($1, $2, $3, $4, true, 1)`,
        [
          stableUuid(`${scope.slug}:objective:${number}`),
          levelVersionId,
          `AIFS_M${String(module.moduleNumber).padStart(2, "0")}_L${String(index + 1).padStart(2, "0")}`,
          `Draft goal: ${title} as part of ${module.objective}.`,
        ],
      );
      await database.query(
        `insert into content_source_references
         (id, level_version_id, kind, title, locator, sort_order)
         values ($1, $2, 'internal_editorial', $3, $4, 1)`,
        [
          stableUuid(`${scope.slug}:source:${number}`),
          levelVersionId,
          "AI-first curriculum brief, subject review pending",
          `docs/product/course-expansion/outlines/${scope.slug}.json#module-${module.moduleNumber}-level-${index + 1}`,
        ],
      );
      if (previous) {
        await database.query(
          "insert into level_prerequisites (level_id, prerequisite_level_id) values ($1, $2)",
          [levelId, previous],
        );
      }
      previous = levelId;
    }
  }
  return "imported";
}

export async function importDraftCourseOutlines(
  database: PoolClient,
  plan: ImportPlan,
): Promise<Readonly<{ imported: number; alreadyImported: number; modules: number; levels: number }>> {
  if (plan.courses.length !== 14 || plan.moduleCount !== 56 || plan.levelCount !== 336) {
    throw new Error("Refusing incomplete 14-course draft outline plan.");
  }
  await database.query("select pg_advisory_xact_lock(hashtext($1))", [
    "aifs-outline-import:14-courses",
  ]);
  let imported = 0;
  let alreadyImported = 0;
  for (const entry of plan.courses) {
    const status = await importOneDraft(database, entry);
    if (status === "imported") imported += 1;
    else alreadyImported += 1;
  }
  const counts = await database.query<{
    courses: number;
    modules: number;
    levels: number;
    challenges: number;
    published: number;
  }>(
    `select count(distinct s.id)::int as courses,
         count(distinct m.id)::int as modules,
         count(distinct lv.id)::int as levels,
         count(distinct c.id)::int as challenges,
         count(distinct case when lv.state = 'published' then lv.id end)::int as published
       from skills s
       join learning_paths p on p.skill_id = s.id
       join learning_modules m on m.learning_path_id = p.id
       join lessons les on les.module_id = m.id
       join levels l on l.lesson_id = les.id
       join level_versions lv on lv.level_id = l.id
       left join challenges c on c.level_id = l.id
      where s.slug = any($1::text[])`,
    [plan.courses.map((entry) => entry.scope.slug)],
  );
  const totals = counts.rows[0];
  if (!totals || totals.courses !== 14 || totals.modules !== 56 || totals.levels !== 336 || totals.published !== 0) {
    throw new Error(`Unsafe or incomplete draft outline import: ${JSON.stringify(totals)}.`);
  }
  return { imported, alreadyImported, modules: totals.modules, levels: totals.levels };
}

async function main(): Promise<void> {
  const mode = assertDraftOutlineImportPermission(process.env, process.argv.slice(2));
  const plan = loadAndValidateDraftCourseOutlines();
  if (mode === "dry_run") {
    console.info(
      `AIFS outline dry-run: 14 unpublished courses, ${plan.moduleCount} modules, ${plan.levelCount} draft levels, checksum ${plan.sha256}. No database connection, assessment or publication.`,
    );
    return;
  }
  const client = createDatabaseClient({
    connectionString: requireDatabaseUrl(),
    applicationName: "skillup-aifs-outline-draft-import",
    maxConnections: 1,
  });
  const database = await client.pool.connect();
  try {
    await database.query("begin");
    const result = await importDraftCourseOutlines(database, plan);
    await database.query("commit");
    console.info(
      `Imported ${result.imported} draft courses (${result.alreadyImported} unchanged), ${result.levels} outline levels; checksum ${plan.sha256}. Nothing published.`,
    );
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
    await client.close();
  }
}

if (process.argv[1]?.endsWith("import-aifs-course-outlines.ts")) {
  await main();
}
