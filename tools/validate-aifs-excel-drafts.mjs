import { readFileSync } from "node:fs";

const root = new URL("../docs/product/course-expansion/drafts/excel/", import.meta.url);
const count = 4;

export function readExcelDraftModules() {
  return Array.from({ length: count }, (_, i) => {
    const path = new URL(`module-${String(i + 1).padStart(2, "0")}.json`, root);
    return JSON.parse(readFileSync(path, "utf8"));
  });
}

export function validateExcelDraftModules(modules) {
  const issues = [];
  if (!Array.isArray(modules) || modules.length !== 4) {
    return ["Expected four proposed Excel modules."];
  }

  const prompts = new Set();
  const titles = new Set();
  let totalChallenges = 0;

  for (const [moduleIndex, module] of modules.entries()) {
    if (
      module?.schemaVersion !== 1 ||
      module.courseSlug !== "excel-google-sheets-work" ||
      module.locale !== "en" ||
      module.moduleNumber !== moduleIndex + 1
    ) {
      issues.push(`Module ${moduleIndex + 1} has invalid identity or version.`);
    }
    if (
      module?.state !== "draft" ||
      module.reviewedBy !== null ||
      module.approvedBy !== null ||
      module.publishedAt !== null
    ) {
      issues.push(`Module ${moduleIndex + 1} must remain unpublished and unapproved.`);
    }
    if (typeof module?.moduleTitle !== "string" || module.moduleTitle.length < 8) {
      issues.push(`Module ${moduleIndex + 1} needs a meaningful title.`);
    }
    if (!Array.isArray(module?.levels) || module.levels.length !== 6) {
      issues.push(`Module ${moduleIndex + 1} must have exactly six levels.`);
      continue;
    }

    for (const [index, level] of module.levels.entries()) {
      const expectedNumber = moduleIndex * 6 + index + 1;
      if (level?.number !== expectedNumber) {
        issues.push(`Module ${moduleIndex + 1} has a wrongly ordered level number.`);
      }
      if (
        typeof level?.title !== "string" ||
        level.title.length < 8 ||
        typeof level.objective !== "string" ||
        level.objective.length < 35 ||
        typeof level.teaching !== "string" ||
        level.teaching.length < 75
      ) {
        issues.push(
          `Level ${expectedNumber} requires substantive original instruction and outcome.`,
        );
      }
      if (titles.has(level?.title)) issues.push(`Duplicated title: ${level.title}.`);
      titles.add(level?.title);
      if (!Array.isArray(level?.challenges) || level.challenges.length < 3) {
        issues.push(`Level ${expectedNumber} needs at least three real challenges.`);
        continue;
      }
      const types = new Set();
      for (const [exerciseIndex, challenge] of level.challenges.entries()) {
        totalChallenges++;
        const id = `Level ${expectedNumber} exercise ${exerciseIndex + 1}`;
        if (
          typeof challenge?.prompt !== "string" ||
          challenge.prompt.length < 35 ||
          typeof challenge.feedback !== "string" ||
          challenge.feedback.length < 40
        ) {
          issues.push(`${id} needs substantial specific prompt and feedback.`);
        }
        const norm = (challenge?.prompt ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (prompts.has(norm)) issues.push(`${id} duplicates another exercise.`);
        prompts.add(norm);
        if (/confirm the requirement.*check.*evidence|choose.*proportionate.*action/.test(norm)) {
          issues.push(`${id} repeats the rejected generic pattern.`);
        }

        if (challenge.type === "multiple_choice" || challenge.type === "scenario") {
          const opts = challenge.options;
          const keys = opts && typeof opts === "object" ? Object.keys(opts) : [];
          if (
            keys.length !== 3 ||
            keys.some(
              (key) =>
                !["a", "b", "c"].includes(key) ||
                typeof opts[key] !== "string" ||
                opts[key].trim().length < 1,
            ) ||
            !keys.includes(challenge.answer) ||
            new Set(keys.map((key) => opts[key].trim().toLowerCase())).size !== 3
          ) {
            issues.push(`${id} has an invalid answer key or non-distinct distractors.`);
          }
        } else if (challenge.type === "true_false") {
          if (typeof challenge.answer !== "boolean") {
            issues.push(`${id} must have a correct boolean evaluation.`);
          }
        } else {
          issues.push(`${id} uses an unsupported draft challenge type.`);
        }
        types.add(challenge.type);
      }
      if (types.size < 3) {
        issues.push(`Level ${expectedNumber} needs three distinct practice formats.`);
      }
    }
  }
  if (totalChallenges !== 72) {
    issues.push(`Expected 72 course-specific exercises; observed ${totalChallenges}.`);
  }
  return issues;
}

if (process.argv[1]?.endsWith("validate-aifs-excel-drafts.mjs")) {
  const modules = readExcelDraftModules();
  const errors = validateExcelDraftModules(modules);
  if (errors.length) {
    for (const message of errors) console.error(`AIFS DRAFT ERROR: ${message}`);
    process.exitCode = 1;
  } else {
    console.info(
      "Excel draft content verified: 4 modules, 24 levels, 72 distinct exercises. Publication not authorized.",
    );
  }
}
