import { existsSync } from "node:fs";

import { readCurriculumPlan, validateCurriculumBriefs } from "./validate-aifs-curriculum-briefs.mjs";
import {
  readExcelDraftModules,
  validateExcelDraftModules,
} from "./validate-aifs-excel-drafts.mjs";

const root = new URL("../docs/product/course-expansion/", import.meta.url);

function projectPath(slug) {
  return slug === "excel-google-sheets-work"
    ? new URL("drafts/excel/CAPSTONE.md", root)
    : new URL(`capstones/${slug}.md`, root);
}

export function readAifsReadinessInputs() {
  const { manifest, outlines } = readCurriculumPlan();
  const excelModules = readExcelDraftModules();
  const capstoneSlugs = new Set(
    manifest.courses
      .filter((course) => existsSync(projectPath(course.slug)))
      .map((course) => course.slug),
  );
  return { manifest, outlines, excelModules, capstoneSlugs };
}

/**
 * This is an evidence-based SOURCE snapshot, not a live production database
 * read, editorial signoff or authorization to publish. Draft state is explicit.
 */
export function buildAifsReadiness({ manifest, outlines, excelModules, capstoneSlugs }) {
  const errors = [
    ...validateCurriculumBriefs(manifest, outlines),
    ...validateExcelDraftModules(excelModules),
  ];
  if (errors.length) throw new Error(`AIFS content readiness source invalid: ${errors.join("; ")}`);
  if (!(capstoneSlugs instanceof Set) || capstoneSlugs.size !== 15) {
    throw new Error("All 15 distinct draft capstone templates must exist before reporting readiness.");
  }
  for (const slug of capstoneSlugs) {
    if (!manifest.courses.some((course) => course.slug === slug)) {
      throw new Error(`Unexpected capstone identifier: ${slug}.`);
    }
  }

  const courses = manifest.courses.map((course, i) => {
    const outline = outlines[i];
    if (
      course.proposedStatus !== "draft_not_for_publication" ||
      outline.publicationAllowed !== false ||
      outline.state !== "outline_draft" ||
      outline.reviewedBy !== null ||
      outline.publishedAt !== null
    ) {
      throw new Error(`Publication and human review are not attested for ${course.slug}.`);
    }
    const excel = course.slug === "excel-google-sheets-work";
    const authoredDraftLevels = excel ? excelModules.reduce((n, module) => n + module.levels.length, 0) : 0;
    const authoredDraftExercises = excel
      ? excelModules.reduce(
          (total, module) =>
            total + module.levels.reduce((count, level) => count + level.challenges.length, 0),
          0,
        )
      : 0;
    return {
      slug: course.slug,
      title: course.title,
      wave: course.wave,
      category: course.category,
      levelBriefCount: outline.modules.reduce((n, module) => n + module.levelTitles.length, 0),
      authoredDraftLevels,
      authoredDraftExercises,
      minimumExerciseTarget: 72,
      remainingDraftExercises: Math.max(0, 72 - authoredDraftExercises),
      capstoneTemplatePresent: capstoneSlugs.has(course.slug),
      editorialState: "unreviewed_draft",
      publicationAuthorized: false,
      readyForSubscriberRelease: false,
    };
  });

  const totals = {
    proposedNewCourses: courses.length,
    proposedLevelBriefs: courses.reduce((sum, course) => sum + course.levelBriefCount, 0),
    authoredDraftLevels: courses.reduce((sum, course) => sum + course.authoredDraftLevels, 0),
    authoredDraftExercises: courses.reduce((sum, course) => sum + course.authoredDraftExercises, 0),
    minimumRequiredNewExercises: courses.reduce((sum, course) => sum + course.minimumExerciseTarget, 0),
    minimumExercisesStillToAuthor: courses.reduce(
      (sum, course) => sum + course.remainingDraftExercises,
      0,
    ),
    unapprovedCapstoneTemplates: courses.filter((course) => course.capstoneTemplatePresent).length,
    editoriallyApprovedNewCourses: 0,
    publisherAuthorizedNewCourses: 0,
    newCoursesReleasedByThisBatch: 0,
  };
  if (
    totals.proposedNewCourses !== 15 ||
    totals.proposedLevelBriefs !== 360 ||
    totals.minimumRequiredNewExercises !== 1080 ||
    totals.unapprovedCapstoneTemplates !== 15
  ) {
    throw new Error("The AIFS source counts are inconsistent with the approved planning scope.");
  }
  return {
    reportType: "aifs-source-evidence-only",
    liveDatabaseVerified: false,
    plannedCourseTotalAfterFutureApproval: manifest.targets.totalCourses,
    baselinePublishedCoursesFromPlanningSource: manifest.sourceBaseline.existingCourses,
    baselineCurriculumLevelsFromPlanningSource: manifest.sourceBaseline.existingCurriculumLevels,
    currentPublicationClaim: "No additional courses are authorized or verified as published by this report.",
    totals,
    courses,
  };
}

if (process.argv[1]?.endsWith("report-aifs-readiness.mjs")) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length > 0 && args[0] !== "--json")) {
    console.error("Only --json is supported. Report never approves or publishes content.");
    process.exitCode = 1;
  } else {
    const report = buildAifsReadiness(readAifsReadinessInputs());
    if (args[0] === "--json") {
      console.info(JSON.stringify(report, null, 2));
    } else {
      const { totals } = report;
      console.info(
        `AIFS source readiness: ${totals.proposedNewCourses} planned courses / ${totals.proposedLevelBriefs} proposed levels; ${totals.authoredDraftLevels} detailed draft levels / ${totals.authoredDraftExercises} original draft exercises; ${totals.minimumExercisesStillToAuthor} minimum exercises remaining; ${totals.unapprovedCapstoneTemplates} unapproved project templates. New approved/published courses: ZERO. Not a live deployment check.`,
      );
    }
  }
}
