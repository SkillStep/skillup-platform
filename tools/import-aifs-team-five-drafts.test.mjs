import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTeamFiveDraftImportPermission,
  buildTeamFiveImportPlan,
  stableTeamFiveId,
} from "./import-aifs-team-five-drafts.mjs";
import { readTeamFiveCourseDrafts } from "./validate-aifs-team-five-courses.mjs";

test("five-course importer requires complete immutable draft content and refuses publication", () => {
  const plan = buildTeamFiveImportPlan(readTeamFiveCourseDrafts());
  assert.equal(plan.courses.length, 5);
  assert.equal(plan.modules, 20);
  assert.equal(plan.levels, 120);
  assert.equal(plan.challenges, 360);
  assert.equal(plan.capstones, 5);
  assert.equal(plan.publicationAllowed, false);
  assert.equal(plan.state, "draft");
  assert.match(plan.sha256, /^[0-9a-f]{64}$/);
});

test("production, preview and unknown environment writes are refused", () => {
  for (const appEnv of ["production", "prod", "preview", "testing", ""]) {
    assert.throws(
      () =>
        assertTeamFiveDraftImportPermission({ APP_ENV: appEnv, AIFS_ALLOW_DRAFT_IMPORT: "yes" }, [
          "--apply-draft",
        ]),
      /forbidden/,
    );
  }
});

test("dry-run is the default and an explicit second acknowledgment is required", () => {
  assert.equal(assertTeamFiveDraftImportPermission({}, []), "dry_run");
  assert.equal(assertTeamFiveDraftImportPermission({}, ["--dry-run"]), "dry_run");
  assert.throws(
    () => assertTeamFiveDraftImportPermission({ APP_ENV: "staging" }, ["--apply-draft"]),
    /AIFS_ALLOW_DRAFT_IMPORT=yes/,
  );
  assert.equal(
    assertTeamFiveDraftImportPermission({ APP_ENV: "staging", AIFS_ALLOW_DRAFT_IMPORT: "yes" }, [
      "--apply-draft",
    ]),
    "apply_draft",
  );
  assert.throws(() => assertTeamFiveDraftImportPermission({}, ["--publish"]), /Only/);
  assert.throws(
    () => assertTeamFiveDraftImportPermission({}, ["--dry-run", "--apply-draft"]),
    /Only/,
  );
});

test("reused course identity namespace matches outline importer, not new duplicated slugs", () => {
  assert.match(stableTeamFiveId("data-analytics-dashboards:level:1"), /^[0-9a-f-]{36}$/);
  assert.equal(
    stableTeamFiveId("data-analytics-dashboards:level:1"),
    stableTeamFiveId("data-analytics-dashboards:level:1"),
  );
  assert.notEqual(
    stableTeamFiveId("data-analytics-dashboards:level:1"),
    stableTeamFiveId("prompt-engineering-generative-ai:level:1"),
  );
});

test("rejects edited, partial or incorrectly signed-off content before opening the DB", () => {
  const changed = structuredClone(readTeamFiveCourseDrafts());
  changed[0].modules[0].levels[0].challenges.pop();
  changed[1].subjectReviewedBy = "fabricated";
  assert.throws(() => buildTeamFiveImportPlan(changed), /Unreviewable AI-first content/);
});
