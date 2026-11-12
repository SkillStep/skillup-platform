import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAiDraftRequestBriefs,
  readCurriculumPlan,
  validateCurriculumBriefs,
} from "./validate-aifs-curriculum-briefs.mjs";

const { manifest, outlines } = readCurriculumPlan();

test("the 15-course roadmap contains 360 unique reviewable level titles", () => {
  assert.deepEqual(validateCurriculumBriefs(manifest, outlines), []);
});

test("AI generation plan has correct total, module progression and protected input policy", () => {
  const jobs = buildAiDraftRequestBriefs(manifest, outlines);
  assert.equal(jobs.length, 360);
  assert.equal(new Set(jobs.map((job) => `${job.courseSlug}:${job.levelNumber}`)).size, 360);
  for (const job of jobs) {
    assert.equal(job.task, "generate_level");
    assert.equal(job.publicationStatus, "draft");
    assert.equal(job.publishedAt, null);
    assert.equal(job.reviewedBy, null);
    assert.equal(job.inputPayload.contextCountry, "Pakistan");
    assert.equal(job.inputPayload.permittedData, "fictional examples only");
    assert.ok(job.inputPayload.title.length >= 16);
    assert.ok(job.levelNumber >= 1 && job.levelNumber <= 24);
    assert.ok(job.inputPayload.practiceRequirement.includes("three different"));
  }
});

test("counterfeit review approval and publishing flags cannot enter the generation queue", () => {
  const edited = structuredClone(outlines);
  edited[0].publicationAllowed = true;
  edited[1].reviewedBy = "AI";
  edited[2].publishedAt = "2026-11-12T00:00:00.000Z";
  const errors = validateCurriculumBriefs(manifest, edited).join(" ");
  assert.match(errors, /review boundary/);
  assert.throws(() => buildAiDraftRequestBriefs(manifest, edited), /Invalid AI-first course briefs/);
});

test("duplicate, generic or incomplete level plans fail before AI drafting", () => {
  const edited = structuredClone(outlines);
  edited[0].modules[0].levelTitles[1] = edited[0].modules[0].levelTitles[0];
  edited[1].modules[0].levelTitles[0] = "Level 1";
  edited[2].modules[1].levelTitles.pop();
  const errors = validateCurriculumBriefs(manifest, edited).join(" ");
  assert.match(errors, /duplicate title/);
  assert.match(errors, /generic level title/);
  assert.match(errors, /expected six levels/);
});

test("reordering, adding a new course or changing a module objective fails manifest alignment", () => {
  const changed = structuredClone(outlines);
  changed[0].modules[0].objective = "A different unreviewed topic";
  const errors = validateCurriculumBriefs(manifest, changed).join(" ");
  assert.match(errors, /not aligned to product scope/);
  const reordered = [...outlines].reverse();
  assert.notDeepEqual(validateCurriculumBriefs(manifest, reordered), []);
});
