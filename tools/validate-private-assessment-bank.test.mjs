import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  COURSES,
  validatePrivateAssessmentBanks,
  validatePrivateBankRoot,
} from "./validate-private-assessment-bank.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "skillup-private-bank-"));
  chmodSync(root, 0o700);
  for (const course of COURSES) {
    for (const type of ["practice", "assessments"]) {
      const size = type === "practice" ? 72 : 8;
      const items = Array.from({ length: size }, (_, index) => ({
        id: course + "-" + type + "-" + (index + 1),
        prompt:
          "A new original scenario for " +
          course +
          ", bank " +
          type +
          ", question " +
          (index + 1) +
          " with meaningful enough context?",
        explanation: "A fact-specific explanation for why the answer is correct.",
        sourceReference: "synthetic-test-reference",
        choices: [
          { id: "A", label: "A fully contextualized answer" },
          { id: "B", label: "A plausible but incorrect answer" },
        ],
        correctChoiceId: "A",
        ...(type === "practice"
          ? { levelNumber: Math.floor(index / 3) + 1 }
          : { phase: index < 4 ? "baseline" : "endline" }),
      }));
      const target = join(root, course + "." + type + ".json");
      writeFileSync(
        target,
        JSON.stringify({ courseSlug: course, version: "draft-test-v1", items }),
        { mode: 0o600 },
      );
      chmodSync(target, 0o600);
    }
  }
  return root;
}

test("accepts exactly five synthetic course banks, 360 practice and 40 assessment items", () => {
  const result = validatePrivateAssessmentBanks(fixture());
  assert.deepEqual(
    [result.courseCount, result.practiceItems, result.assessmentItems, result.totalItems],
    [5, 360, 40, 400],
  );
});

test("rejects missing secure external root", () => {
  assert.throws(() => validatePrivateBankRoot(""), /absolute external/);
  assert.throws(
    () => validatePrivateBankRoot("./private-editorial/assessment-banks"),
    /absolute external/,
  );
});

test("rejects weak filesystem permissions", () => {
  const root = fixture();
  chmodSync(join(root, COURSES[0] + ".practice.json"), 0o644);
  if (process.platform !== "win32")
    assert.throws(() => validatePrivateAssessmentBanks(root), /owner-only/);
});

test("fails if a practice level has fewer than three questions", () => {
  const root = fixture();
  const path = join(root, COURSES[0] + ".practice.json");
  const bank = JSON.parse(readFileSync(path, "utf8"));
  bank.items[0].levelNumber = 24;
  writeFileSync(path, JSON.stringify(bank), { mode: 0o600 });
  assert.throws(() => validatePrivateAssessmentBanks(root), /three distinct/);
});

test("rejects invalid private answer key without printing its value", () => {
  const root = fixture();
  const path = join(root, COURSES[0] + ".practice.json");
  const bank = JSON.parse(readFileSync(path, "utf8"));
  bank.items[0].correctChoiceId = "DONT-LEAK-64839";
  writeFileSync(path, JSON.stringify(bank), { mode: 0o600 });
  assert.throws(
    () => validatePrivateAssessmentBanks(root),
    (error) => /answer key/.test(error.message) && !error.message.includes("64839"),
  );
});

test("rejects reused question IDs and prompts across courses", () => {
  const root = fixture();
  const path = join(root, COURSES[1] + ".practice.json");
  const original = readFileSync(path, "utf8");
  const bank = JSON.parse(original);
  bank.items[0].id = COURSES[0] + "-practice-1";
  writeFileSync(path, JSON.stringify(bank), { mode: 0o600 });
  assert.throws(() => validatePrivateAssessmentBanks(root), /duplicate question ID/);
});

test("rejects missing baseline/endline mix", () => {
  const root = fixture();
  const path = join(root, COURSES[4] + ".assessments.json");
  const bank = JSON.parse(readFileSync(path, "utf8"));
  bank.items[0].phase = "endline";
  writeFileSync(path, JSON.stringify(bank), { mode: 0o600 });
  assert.throws(() => validatePrivateAssessmentBanks(root), /four baseline/);
});
