import { readFileSync } from "node:fs";

const manifestLocation = new URL(
  "../docs/product/course-expansion/catalog-plan-v1.json",
  import.meta.url,
);

const requiredCategories = new Set([
  "career-readiness",
  "digital-skills",
  "business",
  "language",
  "life-skills",
]);

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateCourseExpansionPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return ["The course expansion manifest must be a JSON object."];
  }

  if (plan.schemaVersion !== 1) errors.push("Expected schemaVersion=1.");
  if (plan.publicationPolicy !== "planning_only_no_auto_publish") {
    errors.push(
      "The expansion manifest must remain planning-only and may not authorize publication.",
    );
  }
  if (
    plan.sourceBaseline?.existingCourses !== 5 ||
    plan.sourceBaseline?.existingCurriculumLevels !== 68 ||
    plan.sourceBaseline?.seededLegacyPilotLevels !== 1 ||
    plan.sourceBaseline?.seededLegacyPilotChallenges !== 2 ||
    plan.sourceBaseline?.totalSeededLevels !== 69 ||
    plan.sourceBaseline?.totalSeededChallenges !== 206
  ) {
    errors.push(
      "The five-course, 68-curriculum-level + legacy pilot seeded baseline is not preserved.",
    );
  }

  if (!Array.isArray(plan.courses) || plan.courses.length !== 15) {
    errors.push("Exactly 15 planned new courses are required.");
    return errors;
  }

  const seenSlugs = new Set();
  const seenTitles = new Set();
  const waveCounts = new Map([
    [1, 0],
    [2, 0],
    [3, 0],
  ]);
  let modulesTotal = 0;
  let levelsTotal = 0;

  for (const course of plan.courses) {
    const name = course?.slug ?? "(missing slug)";
    if (!present(course?.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(course.slug)) {
      errors.push(`Invalid course slug: ${name}.`);
    }
    if (seenSlugs.has(name)) errors.push(`Duplicate course slug: ${name}.`);
    seenSlugs.add(name);

    if (!present(course?.title)) errors.push(`Missing course title for ${name}.`);
    if (seenTitles.has(course?.title)) errors.push(`Duplicate course title: ${course.title}.`);
    seenTitles.add(course?.title);

    if (course?.proposedStatus !== "draft_not_for_publication") {
      errors.push(`Course ${name} may not claim to be published or reviewed.`);
    }
    if (!requiredCategories.has(course?.category)) {
      errors.push(`Unrecognized category for ${name}.`);
    }
    if (!waveCounts.has(course?.wave)) errors.push(`Invalid wave for ${name}.`);
    else waveCounts.set(course.wave, waveCounts.get(course.wave) + 1);

    for (const field of ["audience", "learningOutcome", "capstoneDeliverable"]) {
      if (!present(course?.[field])) errors.push(`Missing ${field} for ${name}.`);
    }
    if (!Number.isInteger(course?.reviewCadenceDays) || course.reviewCadenceDays < 1) {
      errors.push(`Course ${name} needs a positive review cadence.`);
    }
    if (course?.levelTarget !== 24) errors.push(`Course ${name} requires 24 planned levels.`);
    if (!Array.isArray(course?.minimumReviewers) || course.minimumReviewers.length < 3) {
      errors.push(
        `Course ${name} requires subject, language/accessibility and publisher review roles.`,
      );
    }

    if (!Array.isArray(course?.modules) || course.modules.length !== 4) {
      errors.push(`Course ${name} needs exactly four modules.`);
      continue;
    }
    const seenModules = new Set();
    for (const module of course.modules) {
      modulesTotal += 1;
      levelsTotal += Number.isInteger(module?.levelTarget) ? module.levelTarget : 0;
      if (
        !present(module?.title) ||
        !present(module?.learningObjective) ||
        !present(module?.exampleLevel)
      ) {
        errors.push(`Course ${name} contains an incomplete module.`);
      }
      if (module?.levelTarget !== 6) {
        errors.push(`Each module of ${name} needs six planned levels.`);
      }
      if (seenModules.has(module?.title)) {
        errors.push(`Course ${name} has a duplicate module title.`);
      }
      seenModules.add(module?.title);
    }
  }

  for (const [wave, count] of waveCounts) {
    if (count !== 5) errors.push(`Wave ${wave} must contain exactly five new courses.`);
  }

  const targets = plan.targets ?? {};
  if (
    targets.newCourses !== 15 ||
    targets.newLevels !== 360 ||
    targets.minimumNewChallenges !== 1080 ||
    targets.totalCourses !== 20 ||
    targets.totalCurriculumLevels !== 428 ||
    targets.modulesPerNewCourse !== 4 ||
    targets.levelsPerModule !== 6 ||
    targets.minimumChallengesPerLevel !== 3 ||
    targets.newCapstoneProjects !== 15 ||
    targets.potentialSeededLevelsIfLegacyPilotRemains !== 429 ||
    targets.minimumSeededChallengesIfLegacyPilotRemains !== 1286 ||
    modulesTotal !== 60 ||
    levelsTotal !== 360
  ) {
    errors.push(
      "The expansion target totals do not reconcile with the course and module manifest.",
    );
  }

  return errors;
}

if (process.argv[1]?.endsWith("validate-course-expansion-plan.mjs")) {
  const plan = JSON.parse(readFileSync(manifestLocation, "utf8"));
  const errors = validateCourseExpansionPlan(plan);
  if (errors.length > 0) {
    for (const error of errors) console.error(`COURSE EXPANSION PLAN ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.info(
      "Course expansion draft manifest verified: 15 courses, 60 modules, 360 proposed levels, 3 equal waves.",
    );
  }
}
