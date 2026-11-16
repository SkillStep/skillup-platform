import { readFileSync } from "node:fs";

import {
  COURSE_IDENTITIES,
  readTeamFiveCourseDrafts,
  validateTeamFiveCourseDrafts,
} from "./validate-aifs-team-five-courses.mjs";

const root = new URL("../docs/product/course-expansion/drafts/team-five/assessments/", import.meta.url);
const normalize = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function readTeamFiveAssessments() {
  return COURSE_IDENTITIES.map(([slug]) =>
    JSON.parse(readFileSync(new URL(`${slug}.json`, root), "utf8")),
  );
}

export function validateTeamFiveAssessments(banks, courses) {
  const errors = [];
  const courseValidation = validateTeamFiveCourseDrafts(courses);
  if (courseValidation.issues.length) {
    errors.push(...courseValidation.issues);
    return { errors, totals: { courses: 0, baseline: 0, endline: 0, questions: 0 } };
  }
  const totals = { courses: 0, baseline: 0, endline: 0, questions: 0 };
  if (!Array.isArray(banks) || banks.length !== 5) {
    return { errors: ["Exactly five baseline/endline assessment banks are required."], totals };
  }
  const allPrompts = new Set(
    courses.flatMap((c) =>
      c.modules.flatMap((m) => m.levels.flatMap((l) => l.challenges.map((q) => normalize(q.prompt)))),
    ),
  );
  const allKeys = new Set();
  for (const [i, bank] of banks.entries()) {
    const slug = COURSE_IDENTITIES[i][0];
    if (
      bank.schemaVersion !== 1 ||
      bank.courseSlug !== slug ||
      bank.locale !== "en" ||
      bank.state !== "draft" ||
      bank.publicationAllowed !== false ||
      bank.gradingPolicyApproved !== false ||
      bank.reviewedBy !== null ||
      bank.approvedBy !== null ||
      bank.publishedAt !== null ||
      !Array.isArray(bank.questions) ||
      bank.questions.length !== 8
    ) {
      errors.push(`${slug}: invalid assessment identity, publication status or count.`);
      continue;
    }
    totals.courses++;
    const byPhase = { baseline: new Map(), endline: new Map() };
    for (const [index, q] of bank.questions.entries()) {
      const phase = q.phase;
      if (!["baseline", "endline"].includes(phase)) {
        errors.push(`${slug}/q${index + 1}: unsupported assessment phase.`);
        continue;
      }
      totals[phase]++;
      totals.questions++;
      if (q.state !== "draft" || q.type !== "multiple_choice") {
        errors.push(`${slug}/q${index + 1}: unsupported private-key assessment type/state.`);
      }
      if (
        typeof q.id !== "string" ||
        !q.id.startsWith(`${slug}-${phase}-`) ||
        allKeys.has(q.id)
      ) errors.push(`${slug}/q${index + 1}: duplicated or invalid assessment ID.`);
      allKeys.add(q.id);
      if (
        typeof q.competency !== "string" ||
        q.competency.length < 5 ||
        byPhase[phase].has(q.competency)
      ) errors.push(`${slug}/q${index + 1}: missing or duplicated competency coverage.`);
      byPhase[phase].set(q.competency, q);
      if (
        typeof q.prompt !== "string" ||
        q.prompt.length < 65 ||
        q.prompt.length > 1000 ||
        typeof q.feedback !== "string" ||
        q.feedback.length < 50
      ) errors.push(`${slug}/q${index + 1}: short question or explanation.`);
      const normalized = normalize(q.prompt || "");
      if (allPrompts.has(normalized))
        errors.push(`${slug}/q${index + 1}: duplicate prompt across practice/assessments.`);
      allPrompts.add(normalized);
      const choices = q.options ?? {};
      if (
        Object.keys(choices).sort().join(",") !== "a,b,c" ||
        !["a", "b", "c"].includes(q.answer) ||
        Object.values(choices).some((x) => typeof x !== "string" || x.length < 20) ||
        new Set(Object.values(choices).map((x) => normalize(x || ""))).size !== 3
      ) errors.push(`${slug}/q${index + 1}: invalid options or deterministic evaluator key.`);
    }
    if (byPhase.baseline.size !== 4 || byPhase.endline.size !== 4)
      errors.push(`${slug}: expected four distinct baseline and endline competencies.`);
    if (
      [...byPhase.baseline.keys()].sort().join("|") !==
      [...byPhase.endline.keys()].sort().join("|")
    ) errors.push(`${slug}: baseline/endline competency mapping must match.`);
    for (const [competency, before] of byPhase.baseline) {
      const after = byPhase.endline.get(competency);
      if (after && (normalize(before.prompt) === normalize(after.prompt) ||
        Object.values(before.options).every((choice) =>
          Object.values(after.options).some((other) => normalize(choice) === normalize(other)),
        ))) errors.push(`${slug}/${competency}: final assessment must use a distinct case and answer set.`);
    }
  }
  if (totals.courses !== 5 || totals.baseline !== 20 || totals.endline !== 20 || totals.questions !== 40)
    errors.push(`Expected five banks with 20 baseline and 20 final assessment questions, found ${JSON.stringify(totals)}.`);
  return { errors, totals };
}

if (process.argv[1]?.endsWith("validate-aifs-team-five-assessments.mjs")) {
  const result = validateTeamFiveAssessments(readTeamFiveAssessments(), readTeamFiveCourseDrafts());
  if (result.errors.length) {
    result.errors.forEach((error) => console.error(`AIFS ASSESSMENT ERROR: ${error}`));
    process.exitCode = 1;
  } else {
    console.info("Verified 40 distinct draft questions: 20 baseline + 20 endline across five 24-level courses. No final policy or human approval. No publication.");
  }
}
