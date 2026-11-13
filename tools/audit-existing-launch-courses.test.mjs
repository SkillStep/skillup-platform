import assert from "node:assert/strict";
import test from "node:test";

import { auditExistingLaunchCourses } from "./audit-existing-launch-courses.mjs";

test("quantifies canonical launch boilerplate without treating the legacy pilot as a new level", () => {
  const report = auditExistingLaunchCourses();
  assert.equal(report.courseCount, 5);
  assert.equal(report.curriculumLevels, 68);
  assert.equal(report.templateGeneratedChallenges, 204);
  assert.deepEqual(report.legacyPilot, {
    separateLevels: 1,
    separateChallenges: 2,
    includedAbove: false,
  });
  assert.equal(report.publicationAuthorized, false);
  assert.equal(
    report.courses.every((course) => course.reviewState === "requires_independent_human_review"),
    true,
  );
  assert.equal(
    report.courses
      .flatMap((course) => course.levels)
      .every((level) => level.templateGenerated === 3),
    true,
  );
});

test("handles empty scope without inventing reviewed courses", () => {
  const report = auditExistingLaunchCourses([]);
  assert.equal(report.courseCount, 0);
  assert.equal(report.curriculumLevels, 0);
  assert.equal(report.templateGeneratedChallenges, 0);
  assert.equal(report.publicationAuthorized, false);
});
