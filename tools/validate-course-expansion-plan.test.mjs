import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateCourseExpansionPlan } from "./validate-course-expansion-plan.mjs";

const valid = JSON.parse(
  readFileSync(
    new URL("../docs/product/course-expansion/catalog-plan-v1.json", import.meta.url),
    "utf8",
  ),
);

test("planned expansion manifest has 15 scoped draft-only courses", () => {
  assert.deepEqual(validateCourseExpansionPlan(valid), []);
});

test("autopublishing or invented review status is not allowed", () => {
  const changed = structuredClone(valid);
  changed.publicationPolicy = "auto_publish";
  changed.courses[0].proposedStatus = "published";
  const errors = validateCourseExpansionPlan(changed).join(" ");
  assert.match(errors, /planning-only/);
  assert.match(errors, /may not claim/);
});

test("duplicate slug and incomplete modules fail validation", () => {
  const changed = structuredClone(valid);
  changed.courses[1].slug = changed.courses[0].slug;
  changed.courses[2].modules.pop();
  const errors = validateCourseExpansionPlan(changed).join(" ");
  assert.match(errors, /Duplicate course slug/);
  assert.match(errors, /exactly four modules/);
  assert.match(errors, /target totals/);
});

test("unexpected release totals or course priorities fail validation", () => {
  const changed = structuredClone(valid);
  changed.courses[14].wave = 1;
  changed.targets.newLevels = 361;
  const errors = validateCourseExpansionPlan(changed).join(" ");
  assert.match(errors, /Wave 1/);
  assert.match(errors, /Wave 3/);
  assert.match(errors, /target totals/);
});
