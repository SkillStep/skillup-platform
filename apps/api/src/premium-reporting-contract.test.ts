import { describe, expect, it } from "vitest";

import type { AdminIdentity } from "./admin.js";
import {
  PremiumReportQuerySchema,
  premiumAccess,
  resolvePremiumReportRange,
  rowsToCsv,
} from "./premium-reporting-contract.js";

describe("premium reporting date authority", () => {
  const now = new Date("2026-08-03T04:16:00.000Z");

  it("uses Asia/Karachi midnight for today", () => {
    const query = PremiumReportQuerySchema.parse({ preset: "today", aggregation: "daily" });
    const range = resolvePremiumReportRange(query, now);
    expect(range.from.toISOString()).toBe("2026-08-02T19:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-08-03T19:00:00.000Z");
  });

  it("resolves the previous calendar month in Asia/Karachi", () => {
    const query = PremiumReportQuerySchema.parse({
      preset: "previous_month",
      aggregation: "monthly",
    });
    const range = resolvePremiumReportRange(query, now);
    expect(range.from.toISOString()).toBe("2026-06-30T19:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-07-31T19:00:00.000Z");
  });

  it("rejects custom ranges without both boundaries", () => {
    expect(() => PremiumReportQuerySchema.parse({ preset: "custom", from: now.toISOString() })).toThrow();
  });

  it("rejects ranges longer than the reporting limit", () => {
    const query = PremiumReportQuerySchema.parse({
      preset: "custom",
      from: "2025-01-01T00:00:00.000Z",
      to: "2026-08-03T00:00:00.000Z",
    });
    expect(() => resolvePremiumReportRange(query, now)).toThrow(/limited to 366 days/);
  });
});

describe("premium administration authorization", () => {
  function identity(roles: AdminIdentity["roles"]): AdminIdentity {
    return { userId: "00000000-0000-4000-8000-000000000001", roles, capabilities: [] };
  }

  it("gives analysts report read without export", () => {
    const access = premiumAccess(identity(["analyst"]));
    expect(access.canReadReports).toBe(true);
    expect(access.canExportReports).toBe(false);
    expect(access.canManagePlans).toBe(false);
  });

  it("gives payment operators report export and subscription adjustment", () => {
    const access = premiumAccess(identity(["payment_operator"]));
    expect(access.canReadReports).toBe(true);
    expect(access.canExportReports).toBe(true);
    expect(access.canAdjustSubscriptions).toBe(true);
    expect(access.canManagePlans).toBe(false);
  });

  it("keeps plan management with security administration", () => {
    const access = premiumAccess(identity(["security_admin"]));
    expect(access.canManagePlans).toBe(true);
    expect(access.canExportReports).toBe(true);
  });
});

describe("premium CSV exports", () => {
  it("escapes commas, quotes, newlines and spreadsheet formulas", () => {
    const csv = rowsToCsv([
      {
        safe: "normal",
        comma: "one,two",
        quote: 'say "hello"',
        newline: "line 1\nline 2",
        formula: "=1+1",
        plus: "+SUM(A1:A2)",
      },
    ]);
    expect(csv).toContain('"one,two"');
    expect(csv).toContain('"say ""hello"""');
    expect(csv).toContain('"line 1\nline 2"');
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+SUM(A1:A2)");
  });
});
