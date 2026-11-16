import { existsSync, readFileSync } from "node:fs";

const root = new URL("../docs/product/course-expansion/drafts/team-five/", import.meta.url);
export const COURSE_IDENTITIES = Object.freeze([
  ["prompt-engineering-generative-ai", "Prompt Engineering & Generative AI"],
  ["cybersecurity-digital-safety", "Cybersecurity & Digital Safety"],
  ["data-analytics-dashboards", "Data Analytics & Decision Making"],
  ["applied-ai-workflows", "AI Automation & No-Code Tools"],
  ["sales-client-negotiation", "Sales, Negotiation & Client Management"],
]);
const existingOutlineRoot = new URL("../docs/product/course-expansion/outlines/", import.meta.url);
const normalize = (value) =>
  value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const cleanText = (value, min, max) =>
  typeof value === "string" && value.trim() === value && value.length >= min && value.length <= max;

export function readTeamFiveCourseDrafts() {
  return COURSE_IDENTITIES.map(([slug]) =>
    JSON.parse(readFileSync(new URL(`${slug}.json`, root), "utf8")),
  );
}

export function validateTeamFiveCourseDrafts(courses, options = {}) {
  const issues = [];
  const stats = { courses: 0, modules: 0, levels: 0, challenges: 0, capstones: 0 };
  if (!Array.isArray(courses) || courses.length !== COURSE_IDENTITIES.length) {
    return { issues: ["Exactly five AI-first draft courses are required."], stats };
  }
  const promptIndex = new Set();
  const slugs = new Set();
  for (const [courseIndex, course] of courses.entries()) {
    const [slug, displayName] = COURSE_IDENTITIES[courseIndex];
    if (
      course?.schemaVersion !== 1 ||
      course.courseSlug !== slug ||
      course.canonicalSlug !== slug ||
      course.publicTitle !== displayName ||
      course.locale !== "en" ||
      course.state !== "draft" ||
      course.publicationAllowed !== false ||
      course.subjectReviewedBy !== null ||
      course.languageReviewedBy !== null ||
      course.publisherId !== null ||
      course.publishedAt !== null ||
      course.sourceKind !== "internal_editorial" ||
      course.sourceReviewRequired !== true
    )
      issues.push(`${slug}: identity or human-review / publication safeguards invalid.`);
    if (slugs.has(slug)) issues.push(`Duplicate course identity: ${slug}`);
    slugs.add(slug);
    if (!Array.isArray(course.modules) || course.modules.length !== 4) {
      issues.push(`${slug}: must have four teaching modules.`);
      continue;
    }
    stats.courses++;
    if (
      typeof course.capstoneFile !== "string" ||
      !/^capstones\/[a-z0-9-]+\.md$/.test(course.capstoneFile) ||
      !existsSync(new URL(course.capstoneFile || "MISSING", root))
    )
      issues.push(`${slug}: missing required practical capstone.`);
    else {
      const content = readFileSync(new URL(course.capstoneFile, root), "utf8");
      if (
        content.length < 1200 ||
        !/rubric/i.test(content) ||
        !/fictional|synthetic/i.test(content) ||
        !/review/i.test(content)
      )
        issues.push(`${slug}: capstone must include synthetic data, rubric and review boundary.`);
      stats.capstones++;
    }
    let aligned = null;
    if (
      ["data-analytics-dashboards", "applied-ai-workflows", "sales-client-negotiation"].includes(
        slug,
      )
    ) {
      aligned = JSON.parse(readFileSync(new URL(`${slug}.json`, existingOutlineRoot), "utf8"));
    }
    let number = 0;
    const levelTitles = new Set();
    let tfTrue = 0;
    let tfFalse = 0;
    for (const [moduleIndex, mod] of course.modules.entries()) {
      stats.modules++;
      if (
        mod.schemaVersion !== 1 ||
        mod.courseSlug !== slug ||
        mod.locale !== "en" ||
        mod.moduleNumber !== moduleIndex + 1 ||
        !cleanText(mod.moduleTitle, 8, 120) ||
        mod.state !== "draft" ||
        mod.reviewedBy !== null ||
        mod.approvedBy !== null ||
        mod.publishedAt !== null ||
        !Array.isArray(mod.levels) ||
        mod.levels.length !== 6
      ) {
        issues.push(`${slug}/module-${moduleIndex + 1}: invalid draft or six-level contract.`);
        continue;
      }
      if (aligned && mod.moduleTitle !== aligned.modules[moduleIndex]?.moduleTitle) {
        issues.push(`${slug}/module-${moduleIndex + 1}: prior outline identity must be reused.`);
      }
      for (const [levelIndex, level] of mod.levels.entries()) {
        number++;
        stats.levels++;
        const id = `${slug}/level-${number}`;
        if (
          level.number !== number ||
          !cleanText(level.title, 12, 120) ||
          levelTitles.has(normalize(level.title))
        ) {
          issues.push(`${id}: wrong sequence, title or duplicate.`);
        }
        levelTitles.add(normalize(level.title));
        if (aligned && level.title !== aligned.modules[moduleIndex].levelTitles[levelIndex]) {
          issues.push(`${id}: must preserve existing outline-level title and order.`);
        }
        for (const [key, min, max] of [
          ["objective", 50, 240],
          ["teaching", 160, 1000],
          ["workedExample", 45, 800],
          ["commonMistake", 18, 500],
          ["remediation", 35, 1000],
          ["hint", 35, 500],
        ]) {
          if (!cleanText(level[key], min, max)) issues.push(`${id}: invalid ${key}.`);
        }
        if (!Array.isArray(level.challenges) || level.challenges.length !== 3) {
          issues.push(`${id}: exactly three evaluable exercises required.`);
          continue;
        }
        const exerciseTypes = new Set();
        for (const [qi, challenge] of level.challenges.entries()) {
          stats.challenges++;
          const questionId = `${id}/exercise-${qi + 1}`;
          if (challenge.type !== ["multiple_choice", "scenario", "true_false"][qi]) {
            issues.push(`${questionId}: expected accessible MC, scenario, true/false practice.`);
          }
          exerciseTypes.add(challenge.type);
          if (!cleanText(challenge.prompt, 65, 1000) || !cleanText(challenge.feedback, 40, 1000)) {
            issues.push(`${questionId}: incomplete question or feedback.`);
          }
          const questionKey = normalize(challenge.prompt || "");
          if (promptIndex.has(questionKey)) issues.push(`${questionId}: duplicated prompt.`);
          promptIndex.add(questionKey);
          if (challenge.type === "true_false") {
            if (typeof challenge.answer !== "boolean")
              issues.push(`${questionId}: missing boolean key.`);
            if (challenge.answer === true) tfTrue++;
            else tfFalse++;
            if (challenge.options !== undefined)
              issues.push(`${questionId}: true/false must not have answer options.`);
          } else {
            const opts = challenge.options;
            if (
              !opts ||
              typeof opts !== "object" ||
              Object.keys(opts).sort().join(",") !== "a,b,c" ||
              !["a", "b", "c"].includes(challenge.answer) ||
              !Object.values(opts).every((v) => cleanText(v, 12, 500)) ||
              new Set(Object.values(opts).map(normalize)).size !== 3
            )
              issues.push(`${questionId}: invalid private key or ambiguous answer options.`);
          }
        }
        if (exerciseTypes.size !== 3)
          issues.push(`${id}: require three distinct evaluation formats.`);
        const initialOptions = level.challenges[0]?.options;
        const transferOptions = level.challenges[1]?.options;
        if (initialOptions && transferOptions) {
          const first = Object.values(initialOptions).map(normalize);
          const second = Object.values(transferOptions).map(normalize);
          if (first.some((choice) => second.includes(choice))) {
            issues.push(
              `${id}: transfer scenario must have its own context-specific answer choices.`,
            );
          }
        }
      }
    }
    if (levelTitles.size !== 24 || number !== 24)
      issues.push(`${slug}: must contain 24 unique levels.`);
    if (tfTrue < 2 || tfFalse < 2) {
      issues.push(`${slug}: true/false assessment must test positive and negative claims.`);
    }
  }
  if (
    stats.courses !== 5 ||
    stats.modules !== 20 ||
    stats.levels !== 120 ||
    stats.challenges !== 360 ||
    stats.capstones !== 5
  ) {
    issues.push(
      `Expected 5 courses, 20 modules, 120 levels, 360 exercises, 5 capstones; saw ${JSON.stringify(stats)}.`,
    );
  }
  return { issues, stats };
}

if (process.argv[1]?.endsWith("validate-aifs-team-five-courses.mjs")) {
  const result = validateTeamFiveCourseDrafts(readTeamFiveCourseDrafts());
  if (result.issues.length) {
    for (const issue of result.issues) console.error(`AIFS FIVE-SKILL ERROR: ${issue}`);
    process.exitCode = 1;
  } else {
    console.info(
      "AIFS five-skill drafts validated: 5 courses, 20 modules, 120 levels, 360 keyed exercises and 5 capstones. Human review pending; PUBLIC-REPO ANSWER KEYS NOT ELIGIBLE FOR RELEASE.",
    );
  }
}
