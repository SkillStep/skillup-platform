import { fileURLToPath } from "node:url";

import { launchChallenges } from "../packages/database/src/complete-launch-challenges.ts";
import { completeLaunchCurriculum } from "../packages/database/src/complete-launch-curriculum.ts";

/**
 * Reproduce the five current seed curricula without touching PostgreSQL.
 * Template-based exercises are counted as *remediation targets*, not approved
 * material. The legacy interview pilot is deliberately accounted separately.
 */
export function auditExistingLaunchCourses(curriculum = completeLaunchCurriculum) {
  const courses = curriculum.map((course) => {
    let flagged = 0;
    const levels = course.modules.flatMap((module, moduleIndex) =>
      module.levels.map(([title, objective], levelIndex) => {
        const strong =
          "Confirm the requirement, use specific evidence and take a clear, proportionate action to " +
          objective +
          ".";
        const weak =
          "Rely on a vague assumption and act without checking evidence while trying to " +
          objective +
          ".";
        const challenges = launchChallenges({
          objective,
          strong,
          weak,
          rotation: course.skillSlug.length + moduleIndex * 4 + levelIndex,
        });
        flagged += challenges.length;
        return {
          title,
          module: module.title,
          challengeTypes: challenges.map((challenge) => challenge.type),
          templateGenerated: challenges.length,
          needsSubjectSpecificReplacement: true,
        };
      }),
    );
    return {
      slug: course.skillSlug,
      moduleCount: course.modules.length,
      levelCount: levels.length,
      templateGeneratedChallenges: flagged,
      reviewState: "requires_independent_human_review",
      levels,
    };
  });

  const count = (key) => courses.reduce((sum, course) => sum + course[key], 0);
  return {
    schemaVersion: 1,
    scope: "five existing launch curricula only",
    source: "complete-launch-curriculum.ts and complete-launch-challenges.ts",
    publicationAuthorized: false,
    courseCount: courses.length,
    curriculumLevels: count("levelCount"),
    templateGeneratedChallenges: count("templateGeneratedChallenges"),
    legacyPilot: { separateLevels: 1, separateChallenges: 2, includedAbove: false },
    remediationOutcome:
      "Replace templated challenges with independently reviewed, course-specific exercises in new immutable versions; preserve all existing learner attempts.",
    courses,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = auditExistingLaunchCourses();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      "Existing course content audit: " +
        report.courseCount +
        " courses, " +
        report.curriculumLevels +
        " canonical levels, " +
        report.templateGeneratedChallenges +
        " generated challenge slots require subject-specific editorial remediation. " +
        "Legacy pilot is tracked separately. No writes or approvals.",
    );
  }
}
