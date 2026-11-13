import assert from "node:assert/strict";
import test from "node:test";

import { readCapstonePack, validateCapstonePack } from "./validate-aifs-capstones.mjs";

const { files, excel } = readCapstonePack();

test("every one of the fifteen new courses has a distinct draft capstone with a rubric", () => {
  assert.deepEqual(validateCapstonePack(files, excel), []);
});

test("capstone assets cannot falsely claim to be published or approved", () => {
  const modified = structuredClone(files);
  modified[0].text = modified[0].text.replace(
    "Status: NOT REVIEWED / NOT PUBLISHED.",
    "Status: APPROVED.",
  );
  assert.match(validateCapstonePack(modified, excel).join(" "), /explicitly remain unpublished/);
});

test("capstone briefs require useful inputs, deliverables and self-check criteria", () => {
  const modified = structuredClone(files);
  modified[1].text = modified[1].text.replace("## Self-check rubric", "## Incomplete");
  modified[2].text = modified[2].text.replace("## Student deliverables", "## Placeholder");
  const errors = validateCapstonePack(modified, excel).join(" ");
  assert.match(errors, /missing: ## Self-check rubric/);
  assert.match(errors, /missing: ## Student deliverables/);
});

test("Excel practical project, CSV data instructions and evaluation checklist stay linked", () => {
  assert.match(excel, /## Learner capstone instructions/);
  assert.match(excel, /## Self-check rubric/);
  assert.match(validateCapstonePack(files, "Missing Excel file").join(" "), /first Excel capstone/);
});
