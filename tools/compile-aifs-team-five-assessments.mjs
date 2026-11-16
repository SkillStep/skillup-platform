import {
  readTeamFiveAssessments,
  validateTeamFiveAssessments,
} from "./validate-aifs-team-five-assessments.mjs";
import { readTeamFiveCourseDrafts } from "./validate-aifs-team-five-courses.mjs";

export function compileTeamFiveAssessments(banks, courses) {
  const result = validateTeamFiveAssessments(banks, courses);
  if (result.errors.length) {
    throw new Error(`Unsafe draft assessment: ${result.errors.join("; ")}`);
  }
  return banks.map((bank) => ({
    courseSlug: bank.courseSlug,
    locale: bank.locale,
    editorialState: "draft",
    publicationAllowed: false,
    scoreThreshold: null,
    reviewedBy: null,
    publishedAt: null,
    questions: bank.questions.map((q) => ({
      phase: q.phase,
      competency: q.competency,
      publicView: {
        key: q.id,
        type: q.type,
        prompt: q.prompt,
        instruction: "Choose the most accurate answer.",
        explanation: q.feedback,
        publicPayload: { selectionLimit: 1 },
        options: Object.entries(q.options),
      },
      // Candidate private keys only; never put this object into public API output or a client bundle.
      privateEvaluation: { correctOptionKeys: [q.answer] },
      editorialState: "draft",
      reviewerId: null,
    })),
  }));
}

if (process.argv[1]?.endsWith("compile-aifs-team-five-assessments.mjs")) {
  const bundles = compileTeamFiveAssessments(
    readTeamFiveAssessments(),
    readTeamFiveCourseDrafts(),
  );
  const count = bundles.reduce((n, bank) => n + bank.questions.length, 0);
  console.info(
    `Prepared ${count} separate baseline/endline candidate questions across ${bundles.length} unpublished course drafts. No DB import, certificate scoring, reviewer claims or publication.`,
  );
}
