import assert from "node:assert/strict";
import test from "node:test";

import { loadTeamFiveDrafts, validateTeamFiveDrafts } from "./validate-team-five-outlines.mjs";

const fixtures = loadTeamFiveDrafts();

test("five original team course outlines remain draft-only and collision-free", () => {
  assert.deepEqual(validateTeamFiveDrafts(fixtures.plan, fixtures.legacy, fixtures.outlines), []);
  assert.equal(
    fixtures.outlines.reduce(
      (total, course) => total + course.modules.reduce((n, m) => n + m.levelTitles.length, 0),
      0,
    ),
    120,
  );
});

test("rejects invented approval or publication", () => {
  const changed = structuredClone(fixtures.outlines);
  changed[0].reviewedBy = "automated reviewer";
  changed[0].publicationAllowed = true;
  const errors = validateTeamFiveDrafts(fixtures.plan, fixtures.legacy, changed);
  assert(errors.some((value) => /claims human approval/.test(value)));
});

test("rejects a duplicate course slug or generic level title", () => {
  const changed = structuredClone(fixtures.outlines);
  changed[1].courseSlug = fixtures.outlines[0].courseSlug;
  changed[1].modules[0].levelTitles[0] = "Level 1";
  const errors = validateTeamFiveDrafts(fixtures.plan, fixtures.legacy, changed);
  assert(errors.some((v) => /contradicts/.test(v)));
  assert(errors.some((v) => /generic/.test(v)));
});
