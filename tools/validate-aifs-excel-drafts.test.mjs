import assert from "node:assert/strict";
import test from "node:test";

import { readExcelDraftModules, validateExcelDraftModules } from "./validate-aifs-excel-drafts.mjs";

const modules = readExcelDraftModules();

test("Excel draft contains exactly 24 sequenced levels and 72 original practice items", () => {
  assert.deepEqual(validateExcelDraftModules(modules), []);
});

test("AI draft must not claim approval or publication", () => {
  const changed = structuredClone(modules);
  changed[0].reviewedBy = "AI";
  changed[0].publishedAt = "2026-11-12T00:00:00.000Z";
  assert.match(validateExcelDraftModules(changed).join(" "), /unpublished and unapproved/);
});

test("duplicate questions and invalid private answer keys fail review", () => {
  const changed = structuredClone(modules);
  changed[0].levels[1].challenges[0].prompt = changed[0].levels[0].challenges[0].prompt;
  changed[0].levels[2].challenges[0].answer = "nonexistent";
  const errors = validateExcelDraftModules(changed).join(" ");
  assert.match(errors, /duplicates another exercise/);
  assert.match(errors, /invalid answer key/);
});

test("generic template patterns are rejected before review", () => {
  const changed = structuredClone(modules);
  changed[0].levels[0].challenges[0].prompt =
    "Confirm the requirement, check evidence and choose the proportionate action before working.";
  assert.match(validateExcelDraftModules(changed).join(" "), /generic pattern/);
});
