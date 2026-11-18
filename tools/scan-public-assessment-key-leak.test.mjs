import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  assertNoPublicTeamFiveAssessmentKeyLeaks,
  findPublicAssessmentKeyLeaks,
} from "./scan-public-assessment-key-leak.mjs";

function write(root, relativePath, contents) {
  const full = join(root, relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents, "utf8");
}

test("passes when no team-five release banks are present", () => {
  const root = mkdtempSync(join(tmpdir(), "skillup-key-scan-"));
  write(
    root,
    "docs/product/course-expansion/drafts/excel/module-01.json",
    JSON.stringify({ challenges: [{ answer: "a" }] }),
  );
  const result = findPublicAssessmentKeyLeaks(root);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.knownDebts.length, 1);
  assert.doesNotThrow(() => assertNoPublicTeamFiveAssessmentKeyLeaks(root));
});

test("fails closed when team-five draft JSON embeds answer fields", () => {
  const root = mkdtempSync(join(tmpdir(), "skillup-key-scan-"));
  write(
    root,
    "docs/product/course-expansion/drafts/team-five/prompt-engineering-generative-ai.json",
    JSON.stringify({
      challenges: [{ type: "multiple_choice", options: { a: "x", b: "y" }, answer: "a" }],
    }),
  );
  const result = findPublicAssessmentKeyLeaks(root);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0], /team-five/);
  assert.throws(() => assertNoPublicTeamFiveAssessmentKeyLeaks(root), /#281/);
});

test("ignores private-editorial banks outside the public scan root contract", () => {
  const root = mkdtempSync(join(tmpdir(), "skillup-key-scan-"));
  write(
    root,
    "private-editorial/assessment-banks/prompt-engineering-generative-ai.practice.json",
    JSON.stringify({ challenges: [{ answer: "c" }] }),
  );
  const result = findPublicAssessmentKeyLeaks(root);
  assert.deepEqual(result.blockers, []);
});
