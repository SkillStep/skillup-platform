import { describe, expect, it } from "vitest";

import { renderSkillCertificatePdf } from "./certificate-pdf.js";

const sample = {
  publicId: "SC-jbaZBVzQlnysJKSwK0ZSm9hmrQ8BjXLJ",
  title: "Certificate of Completion — Interview and Workplace Communication",
  learnerName: "Sample Learner",
  completedAt: new Date("2026-11-12T09:00:00.000Z"),
  issuedAt: new Date("2026-11-15T11:00:00.000Z"),
};

describe("private, immutable A4 certificate rendering", () => {
  it("produces a valid one-page PDF with the exact earned name, course and ID", () => {
    const file = renderSkillCertificatePdf(sample);
    const content = file.toString("ascii");
    expect(file.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(content).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(content).toContain("(Sample Learner)");
    expect(content).toContain("(CERTIFICATE)");
    expect(content).toContain("(OF COMPLETION)");
    expect(content).toContain("(Certificate ID: SC-jbaZBVzQlnysJKSwK0ZSm9hmrQ8BjXLJ)");
    expect(content).toContain("%%EOF");
    expect(content).toContain("/Count 1");
  });

  it("escapes PDF control sequences, not PDF syntax injection", () => {
    const file = renderSkillCertificatePdf({ ...sample, learnerName: "Test (Example) \\ Student" });
    const content = file.toString("ascii");
    expect(content).toContain("Test \\(Example\\) \\\\ Student");
    expect(content).not.toContain("(Test (Example)");
  });

  it("refuses to silently corrupt unsupported Unicode names or oversized text", () => {
    expect(() => renderSkillCertificatePdf({ ...sample, learnerName: "علی خان" })).toThrow(
      /current English PDF font/,
    );
    expect(() =>
      renderSkillCertificatePdf({ ...sample, learnerName: "A".repeat(100) }),
    ).toThrow(/too long/);
  });

  it("creates identical signed content for the same verified award snapshot", () => {
    const a = renderSkillCertificatePdf(sample);
    const b = renderSkillCertificatePdf(sample);
    expect(a.equals(b)).toBe(true);
  });
});
