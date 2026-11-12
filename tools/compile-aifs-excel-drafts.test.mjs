import assert from "node:assert/strict";
import test from "node:test";

import { compileExcelDraftModules } from "./compile-aifs-excel-drafts.mjs";
import { readExcelDraftModules } from "./validate-aifs-excel-drafts.mjs";

const draft = readExcelDraftModules();

test("converts a 24-level Excel draft to seventy-two game-engine challenges", () => {
  const compiled = compileExcelDraftModules(draft);
  assert.equal(compiled.levels.length, 24);
  assert.equal(
    compiled.levels.reduce((n, level) => n + level.challenges.length, 0),
    72,
  );
  assert.deepEqual(
    compiled.levels.map((level) => level.number),
    Array.from({ length: 24 }, (_, i) => i + 1),
  );
  assert.equal(compiled.editorialState, "draft");
  assert.equal(compiled.subjectReviewerId, null);
  assert.equal(compiled.publisherId, null);
  assert.equal(compiled.publishedAt, null);
});

test("keeps game evaluation keys out of public challenge payload", () => {
  const compiled = compileExcelDraftModules(draft);
  for (const level of compiled.levels) {
    for (const challenge of level.challenges) {
      assert.equal(challenge.editorialState, "draft");
      assert.equal(challenge.publisherId, null);
      assert.ok(challenge.privateEvaluation);
      assert.ok(!JSON.stringify(challenge.publicView).includes("correctOptionKeys"));
      assert.ok(!JSON.stringify(challenge.publicView).includes("correctOptionKey"));
      if (challenge.publicView.type === "true_false") {
        assert.deepEqual(challenge.publicView.options, [
          ["true", "True"],
          ["false", "False"],
        ]);
      } else {
        const actualKeys = challenge.publicView.options.map(([key]) => key);
        assert.ok(actualKeys.includes(challenge.privateEvaluation.correctOptionKeys[0]));
      }
    }
  }
});

test("rejects any draft that claims human approval or contains duplicated questions", () => {
  const changed = structuredClone(draft);
  changed[0].approvedBy = "fictional reviewer";
  assert.throws(() => compileExcelDraftModules(changed), /Unpublishable Excel draft/);
  changed[0].approvedBy = null;
  changed[0].levels[0].challenges[1].prompt = changed[0].levels[0].challenges[0].prompt;
  assert.throws(() => compileExcelDraftModules(changed), /duplicates another exercise/);
});
