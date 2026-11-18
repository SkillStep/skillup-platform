import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertNoPublicTeamFiveAssessmentKeyLeaks,
  findPublicAssessmentKeyLeaks,
} from "./scan-public-assessment-key-leak.mjs";

function fixture() {
  return mkdtempSync(join(tmpdir(), "skillup-key-scan-"));
}
function write(root, path, body) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body, "utf8");
}
const teamFive =
  "docs/product/course-expansion/drafts/team-five/prompt-engineering-generative-ai.json";
const oldExcel = "docs/product/course-expansion/drafts/excel/module-01.json";

test("non-Git fixture scans the public course candidate and reports existing Excel debt", () => {
  const root = fixture();
  write(root, oldExcel, JSON.stringify({ questions: [{ answer: "old-public-key" }] }));
  write(
    root,
    teamFive,
    JSON.stringify({
      courseSlug: "prompt-engineering-generative-ai",
      lesson: "safe teaching only",
    }),
  );
  const result = findPublicAssessmentKeyLeaks(root);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.knownDebts.length, 1);
  assert.doesNotThrow(() => assertNoPublicTeamFiveAssessmentKeyLeaks(root));
});

test("rejects original team-five JSON evaluator answers", () => {
  const root = fixture();
  write(root, teamFive, JSON.stringify({ challenges: [{ answer: "not-safe" }] }));
  const result = findPublicAssessmentKeyLeaks(root);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0], /team-five/);
  assert.throws(() => assertNoPublicTeamFiveAssessmentKeyLeaks(root), /#281/);
});

test("rejects YAML answer keys in the team-five directory", () => {
  const root = fixture();
  const path = "docs/product/course-expansion/drafts/team-five/assessments/new.yaml";
  write(root, path, "assessment:\n  correctAnswer: example\n");
  assert.equal(findPublicAssessmentKeyLeaks(root).blockers.length, 1);
});

test("rejects relocated answer keys under a different public path", () => {
  const root = fixture();
  const path = "docs/public/assessment-archive/cybersecurity-digital-safety.json";
  write(root, path, JSON.stringify({ answer: "exposed" }));
  const errors = findPublicAssessmentKeyLeaks(root).blockers;
  assert.equal(errors.length, 1);
  assert.match(errors[0], /relocated/);
});

test("rejects keyed bank relocated to a generic challenge file containing a team-five slug", () => {
  const root = fixture();
  const path = "docs/public/challenge-set.json";
  write(
    root,
    path,
    JSON.stringify({
      slug: "data-analytics-dashboards",
      correctOptionKeys: ["A"],
    }),
  );
  assert.equal(findPublicAssessmentKeyLeaks(root).blockers.length, 1);
});

test("does not scan ignored local private files but detects a force-tracked bank", () => {
  const root = fixture();
  const path = "private-editorial/assessment-banks/applied-ai-workflows.practice.json";
  write(root, path, JSON.stringify({ answer: "private" }));
  assert.deepEqual(findPublicAssessmentKeyLeaks(root).blockers, []);
  const tracked = findPublicAssessmentKeyLeaks(root, { trackedPaths: [path] });
  assert.equal(tracked.blockers.length, 1);
  assert.match(tracked.blockers[0], /force-tracked/);
});

test("does not leak any key value in error messages", () => {
  const root = fixture();
  write(root, teamFive, JSON.stringify({ answer: "SHOULD-NOT-APPEAR-943761" }));
  assert.throws(
    () => assertNoPublicTeamFiveAssessmentKeyLeaks(root),
    (error) => error.message.includes("#281") && !error.message.includes("943761"),
  );
});

test("fails closed for an oversized team-five file", () => {
  const root = fixture();
  write(root, teamFive, "x".repeat(4 * 1024 * 1024 + 1));
  assert.equal(findPublicAssessmentKeyLeaks(root).blockers.length, 1);
});

test("accepts public coming-soon metadata with no evaluator answers", () => {
  const root = fixture();
  write(
    root,
    "docs/public/courses.json",
    JSON.stringify({
      slug: "prompt-engineering-generative-ai",
      status: "coming_soon",
      description: "Learn to improve prompts and evaluate claims",
    }),
  );
  assert.equal(findPublicAssessmentKeyLeaks(root).blockers.length, 0);
});
