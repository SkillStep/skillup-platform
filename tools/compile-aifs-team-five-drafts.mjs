import {
  readTeamFiveCourseDrafts,
  validateTeamFiveCourseDrafts,
} from "./validate-aifs-team-five-courses.mjs";

const fmt = (number) => String(number).padStart(2, "0");
export function compileTeamFiveCourseDrafts(courses) {
  const { issues } = validateTeamFiveCourseDrafts(courses);
  if (issues.length) throw new Error(`Unsafe five-course draft: ${issues.join("; ")}`);
  return courses.map((course) => ({
    courseSlug: course.courseSlug,
    publicTitle: course.publicTitle,
    canonicalSlug: course.canonicalSlug,
    locale: "en",
    editorialState: "draft",
    publicationAllowed: false,
    reviewedBy: null,
    approvedBy: null,
    publishedAt: null,
    capstoneFile: course.capstoneFile,
    levels: course.modules.flatMap((mod) =>
      mod.levels.map((level) => ({
        number: level.number,
        moduleNumber: mod.moduleNumber,
        moduleTitle: mod.moduleTitle,
        title: level.title,
        objective: level.objective,
        teaching: level.teaching,
        workedExample: level.workedExample,
        hint: level.hint,
        commonMistake: level.commonMistake,
        remediation: level.remediation,
        challenges: level.challenges.map((item, index) => {
          const type = item.type;
          const options =
            type === "true_false"
              ? [
                  ["true", "True"],
                  ["false", "False"],
                ]
              : Object.entries(item.options);
          const key = `${course.courseSlug}-m${fmt(mod.moduleNumber)}-l${fmt(level.number)}-c${fmt(index + 1)}`;
          return {
            publicView: {
              key,
              type,
              prompt: item.prompt,
              instruction:
                type === "true_false"
                  ? "Choose true or false."
                  : "Choose the most accurate response.",
              explanation: item.feedback,
              publicPayload: type === "multiple_choice" ? { selectionLimit: 1 } : {},
              options,
            },
            // Editorial / backend-only: keep out of the public API, static JS and browser bundles.
            privateEvaluation:
              type === "true_false"
                ? { correctOptionKey: item.answer ? "true" : "false" }
                : { correctOptionKeys: [item.answer] },
            editorialState: "draft",
            subjectReviewerId: null,
            publisherId: null,
          };
        }),
      })),
    ),
  }));
}

if (process.argv[1]?.endsWith("compile-aifs-team-five-drafts.mjs")) {
  const compiled = compileTeamFiveCourseDrafts(readTeamFiveCourseDrafts());
  const levels = compiled.reduce((n, x) => n + x.levels.length, 0);
  const exercises = compiled.reduce(
    (n, x) => n + x.levels.reduce((a, b) => a + b.challenges.length, 0),
    0,
  );
  console.info(
    `Compiled ${compiled.length} unreviewed courses, ${levels} draft levels, ${exercises} 3-format challenges into public/private evaluator contracts; no database write, publication or human approval. Source is PUBLIC; rotate keys before release.`,
  );
}
