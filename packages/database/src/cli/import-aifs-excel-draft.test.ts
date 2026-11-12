import { describe, expect, it } from "vitest";

import {
  assertDraftImportPermission,
  loadAndValidateExcelDraft,
} from "./import-aifs-excel-draft.js";

describe("AI-first spreadsheet draft import safety", () => {
  it("loads four full Excel modules without fabricated reviewer identity", () => {
    const result = loadAndValidateExcelDraft();
    expect(result.levels).toBe(24);
    expect(result.challenges).toBe(72);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.modules.every((module) => module.state === "draft")).toBe(true);
    expect(result.modules.every((module) => module.reviewedBy === null)).toBe(true);
    expect(result.modules.every((module) => module.publishedAt === null)).toBe(true);
  });

  it("defaults to dry-run without any environment variables or credentials", () => {
    expect(assertDraftImportPermission({}, [])).toBe("dry_run");
    expect(assertDraftImportPermission({}, ["--dry-run"])).toBe("dry_run");
  });

  it("refuses production and any non-allowlisted environment", () => {
    for (const appEnv of ["production", "prod", "preview", "", "testing"]) {
      expect(() =>
        assertDraftImportPermission({ APP_ENV: appEnv, AIFS_ALLOW_DRAFT_IMPORT: "yes" }, [
          "--apply-draft",
        ]),
      ).toThrow("forbidden");
    }
  });

  it("requires an explicit second write acknowledgment for staging", () => {
    expect(() => assertDraftImportPermission({ APP_ENV: "staging" }, ["--apply-draft"])).toThrow(
      "AIFS_ALLOW_DRAFT_IMPORT=yes",
    );
    expect(
      assertDraftImportPermission({ APP_ENV: "staging", AIFS_ALLOW_DRAFT_IMPORT: "yes" }, [
        "--apply-draft",
      ]),
    ).toBe("apply_draft");
  });

  it("rejects unknown flags or attempts to mix modes", () => {
    expect(() => assertDraftImportPermission({}, ["--publish"])).toThrow("Only");
    expect(() => assertDraftImportPermission({}, ["--dry-run", "--apply-draft"])).toThrow("Only");
  });
});
