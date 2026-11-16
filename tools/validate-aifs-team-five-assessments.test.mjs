import assert from "node:assert/strict";
import test from "node:test";

import {
  readTeamFiveAssessments,
  validateTeamFiveAssessments,
} from "./validate-aifs-team-five-assessments.mjs";
import { readTeamFiveCourseDrafts } from "./validate-aifs-team-five-courses.mjs";

const banks = readTeamFiveAssessments();
const courses = readTeamFiveCourseDrafts();

test("five independent assessment banks cover 20 matched baseline/final competencies", () => {
  const result = validateTeamFiveAssessments(banks, courses);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.totals, { courses: 5, baseline: 20, endline: 20, questions: 40 });
});

test("unapproved scoring and fabricated reviewers cannot slip into an assessment bank", () => {
  const changed = structuredClone(banks);
  changed[0].gradingPolicyApproved = true;
  changed[1].approvedBy = "automation";
  changed[2].publicationAllowed = true;
  assert.match(
    validateTeamFiveAssessments(changed, courses).errors.join(" "),
    /invalid assessment/,
  );
});

test("baseline and final questions must be distinct and assess the same competencies", () => {
  const changed = structuredClone(banks);
  changed[0].questions[1].prompt = changed[0].questions[0].prompt;
  changed[1].questions[1].competency = "unexpected new competency";
  assert.match(validateTeamFiveAssessments(changed, courses).errors.join(" "), /duplicate prompt/);
  assert.match(
    validateTeamFiveAssessments(changed, courses).errors.join(" "),
    /competency mapping/,
  );
});

test("private evaluator answers must match valid three-option choices", () => {
  const changed = structuredClone(banks);
  changed[4].questions[4].answer = "unsupported";
  assert.match(validateTeamFiveAssessments(changed, courses).errors.join(" "), /evaluator key/);
});
