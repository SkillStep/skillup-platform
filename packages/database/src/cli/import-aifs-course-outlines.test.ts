import { describe, expect, it } from "vitest";

import {
  assertDraftOutlineImportPermission,
  loadAndValidateDraftCourseOutlines,
} from "./import-aifs-course-outlines.js";

describe("14-course draft-only syllabus importer", () => {
  it("validates all 14 additional courses, 56 modules and 336 unique level titles", () => {
    const plan = loadAndValidateDraftCourseOutlines();
    expect(plan.courses).toHaveLength(14);
    expect(plan.moduleCount).toBe(56);
    expect(plan.levelCount).toBe(336);
    expect(plan.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(plan.courses.map((entry) => entry.scope.slug)).size).toBe(14);
    for (const entry of plan.courses) {
      expect(entry.scope.slug).not.toBe("excel-google-sheets-work");
      expect(entry.scope.proposedStatus).toBe("draft_not_for_publication");
      expect(entry.outline.publicationAllowed).toBe(false);
      expect(entry.outline.reviewedBy).toBeNull();
      expect(entry.outline.publishedAt).toBeNull();
      expect(entry.outline.modules).toHaveLength(4);
      expect(entry.outline.modules.every((module) => module.levelTitles.length === 6)).toBe(true);
      expect(entry.outline.modules.every((module) => module.reviewStatus === "subject_review_pending")).toBe(true);
    }
  });

  it("does not touch any database unless explicit --apply-draft is supplied", () => {
    expect(assertDraftOutlineImportPermission({}, [])).toBe("dry_run");
    expect(assertDraftOutlineImportPermission({}, ["--dry-run"])).toBe("dry_run");
  });

  it("denies production, unknown environments and unacknowledged writes", () => {
    for (const appEnv of ["production", "prod", "preview", "testing", ""]) {
      expect(() =>
        assertDraftOutlineImportPermission(
          { APP_ENV: appEnv, AIFS_ALLOW_DRAFT_IMPORT: "yes" },
          ["--apply-draft"],
        ),
      ).toThrow("forbidden");
    }
    expect(() =>
      assertDraftOutlineImportPermission({ APP_ENV: "staging" }, ["--apply-draft"]),
    ).toThrow("AIFS_ALLOW_DRAFT_IMPORT=yes");
  });

  it("permits explicitly authorized draft writes only to test/development/staging", () => {
    for (const appEnv of ["test", "development", "staging"]) {
      expect(
        assertDraftOutlineImportPermission(
          { APP_ENV: appEnv, AIFS_ALLOW_DRAFT_IMPORT: "yes" },
          ["--apply-draft"],
        ),
      ).toBe("apply_draft");
    }
  });

  it("rejects publishing flags and mixed import modes", () => {
    expect(() => assertDraftOutlineImportPermission({}, ["--publish"])).toThrow("Only");
    expect(() =>
      assertDraftOutlineImportPermission({}, ["--dry-run", "--apply-draft"]),
    ).toThrow("Only");
  });
});
