import assert from "node:assert/strict";
import test from "node:test";
import {
  readTeamFiveCourseDrafts,
  validateTeamFiveCourseDrafts,
} from "./validate-aifs-team-five-courses.mjs";

const courses = readTeamFiveCourseDrafts();

test("five complete courses contain 120 original draft levels, 360 keyed challenges and five capstones", () => {
  const result = validateTeamFiveCourseDrafts(courses);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.stats, {
    courses: 5,
    modules: 20,
    levels: 120,
    challenges: 360,
    capstones: 5,
  });
});

test("rejects manufactured human signoffs and accidental publish toggles", () => {
  const changed = structuredClone(courses);
  changed[0].publicationAllowed = true;
  changed[1].modules[0].reviewedBy = "automated-bot";
  changed[2].subjectReviewedBy = "ai";
  const errors = validateTeamFiveCourseDrafts(changed).issues.join(" ");
  assert.match(errors, /publication safeguards invalid/);
  assert.match(errors, /invalid draft/);
});

test("rejects exposure of an incorrect evaluator key or duplicate question", () => {
  const changed = structuredClone(courses);
  changed[0].modules[0].levels[0].challenges[0].answer = "not-an-option";
  changed[1].modules[0].levels[1].challenges[0].prompt =
    changed[0].modules[0].levels[0].challenges[0].prompt;
  const errors = validateTeamFiveCourseDrafts(changed).issues.join(" ");
  assert.match(errors, /invalid private key/);
  assert.match(errors, /duplicated prompt/);
});

test("three reused courses preserve original outline identities, level order and slugs", () => {
  const changed = structuredClone(courses);
  changed[2].modules[0].levels[0].title = "A renamed and duplicated level";
  const errors = validateTeamFiveCourseDrafts(changed).issues.join(" ");
  assert.match(errors, /must preserve existing outline-level title/);
});

test("missing lessons or exercise formats cannot pass content readiness", () => {
  const changed = structuredClone(courses);
  changed[4].modules[3].levels.pop();
  changed[0].modules[1].levels[0].challenges[1].type = "multiple_choice";
  const errors = validateTeamFiveCourseDrafts(changed).issues.join(" ");
  assert.match(errors, /six-level contract/);
  assert.match(errors, /expected accessible MC/);
});

test("transfer case must not copy the introductory quiz answer choices", () => {
  const mutated = structuredClone(courses);
  mutated[0].modules[0].levels[0].challenges[1].options = structuredClone(
    mutated[0].modules[0].levels[0].challenges[0].options,
  );
  const errors = validateTeamFiveCourseDrafts(mutated).issues.join(" ");
  assert.match(errors, /context-specific answer choices/);
});
