import { readExcelDraftModules, validateExcelDraftModules } from "./validate-aifs-excel-drafts.mjs";

const format = (n) => String(n).padStart(2, "0");

function compileQuestion(question, level, index) {
  const key = `excel-m${format(Math.ceil(level.number / 6))}-l${format(level.number)}-c${format(index + 1)}`;
  const publicView = {
    key,
    type: question.type,
    prompt: question.prompt,
    instruction:
      question.type === "true_false" ? "Choose true or false." : "Choose the most accurate answer.",
    explanation: question.feedback,
    publicPayload: question.type === "multiple_choice" ? { selectionLimit: 1 } : {},
    options:
      question.type === "true_false"
        ? [
            ["true", "True"],
            ["false", "False"],
          ]
        : Object.entries(question.options ?? {}),
  };
  const privateEvaluation =
    question.type === "true_false"
      ? { correctOptionKey: question.answer ? "true" : "false" }
      : { correctOptionKeys: [question.answer] };
  return {
    publicView,
    privateEvaluation,
    editorialState: "draft",
    subjectReviewerId: null,
    publisherId: null,
  };
}

/**
 * Compiles editorial drafts into the existing seven-format game contract,
 * but deliberately cannot publish, seed DB rows or stamp human review.
 * Private keys must stay in an authenticated editorial storage boundary.
 */
export function compileExcelDraftModules(modules) {
  const errors = validateExcelDraftModules(modules);
  if (errors.length) throw new Error(`Unpublishable Excel draft: ${errors.join("; ")}`);

  return {
    courseSlug: "excel-google-sheets-work",
    locale: "en",
    editorialState: "draft",
    subjectReviewerId: null,
    publisherId: null,
    approvedAt: null,
    publishedAt: null,
    levels: modules.flatMap((module) =>
      module.levels.map((level) => ({
        number: level.number,
        moduleNumber: module.moduleNumber,
        title: level.title,
        objective: level.objective,
        teaching: level.teaching,
        challenges: level.challenges.map((question, index) =>
          compileQuestion(question, level, index),
        ),
      })),
    ),
  };
}

if (process.argv[1]?.endsWith("compile-aifs-excel-drafts.mjs")) {
  const result = compileExcelDraftModules(readExcelDraftModules());
  const challengeCount = result.levels.reduce((total, level) => total + level.challenges.length, 0);
  console.info(
    `Converted ${result.levels.length} Excel draft levels and ${challengeCount} exercises to the gameplay draft contract. Not published.`,
  );
}
