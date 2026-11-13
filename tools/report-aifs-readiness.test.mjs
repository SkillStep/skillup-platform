import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAifsReadiness,
  readAifsReadinessInputs,
} from "./report-aifs-readiness.mjs";

const inputs = readAifsReadinessInputs();

test("honest AIFS source readiness distinguishes plans, draft lessons and publication", () => {
  const report = buildAifsReadiness(inputs);
  assert.equal(report.liveDatabaseVerified, false);
  assert.equal(report.baselinePublishedCoursesFromPlanningSource, 5);
  assert.equal(report.totals.proposedNewCourses, 15);
  assert.equal(report.totals.proposedLevelBriefs, 360);
  assert.equal(report.totals.authoredDraftLevels, 24);
  assert.equal(report.totals.authoredDraftExercises, 72);
  assert.equal(report.totals.minimumRequiredNewExercises, 1080);
  assert.equal(report.totals.minimumExercisesStillToAuthor, 1008);
  assert.equal(report.totals.unapprovedCapstoneTemplates, 15);
  assert.equal(report.totals.editoriallyApprovedNewCourses, 0);
  assert.equal(report.totals.newCoursesReleasedByThisBatch, 0);
  assert.ok(report.courses.every((course) => course.publicationAuthorized === false));
  assert.ok(report.courses.every((course) => course.readyForSubscriberRelease === false));
  assert.equal(report.courses.filter((course) => course.authoredDraftLevels > 0).length, 1);
});

test("reports no template coverage if any capstone file is missing", () => {
  const changed = {
    ...inputs,
    capstoneSlugs: new Set([...inputs.capstoneSlugs].slice(1)),
  };
  assert.throws(
    () => buildAifsReadiness(changed),
    /All 15 distinct draft capstone templates/,
  );
});

test("rejects counterfeit human review or content publication flags", () => {
  const changed = structuredClone({
    manifest: inputs.manifest,
    outlines: inputs.outlines,
    excelModules: inputs.excelModules,
  });
  changed.outlines[0].reviewedBy = "AI agent";
  assert.throws(
    () =>
      buildAifsReadiness({
        ...changed,
        capstoneSlugs: inputs.capstoneSlugs,
      }),
    /invalid|review/,
  );
});

test("rejects duplicate level briefs instead of reporting inflated content value", () => {
  const changed = structuredClone({
    manifest: inputs.manifest,
    outlines: inputs.outlines,
    excelModules: inputs.excelModules,
  });
  changed.outlines[2].modules[0].levelTitles[1] =
    changed.outlines[2].modules[0].levelTitles[0];
  assert.throws(
    () =>
      buildAifsReadiness({
        ...changed,
        capstoneSlugs: inputs.capstoneSlugs,
      }),
    /duplicate title/,
  );
});
