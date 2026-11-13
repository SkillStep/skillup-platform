import { describe, expect, it, vi } from "vitest";

import { createCourseEditorialService } from "./course-editorial.js";

const editor = { userId: "editor-id", roles: ["content_editor"] };
const reviewer = { userId: "reviewer-id", roles: ["content_reviewer"] };
const publisher = { userId: "publisher-id", roles: ["publisher"] };
const noDatabase = {
  query: vi.fn(() => {
    throw new Error("Database access was not expected.");
  }),
  connect: vi.fn(() => {
    throw new Error("Database access was not expected.");
  }),
} as never;

describe("AIFS editorial role and release gate", () => {
  const service = createCourseEditorialService({ pool: noDatabase, publishEnabled: false });

  it("refuses publication before any connection unless specifically enabled", async () => {
    await expect(
      service.publish(publisher as never, "invalid", {
        reason: "Staging QA must not be bypassed.",
        stagingEvidenceUrl: "https://example.org/qa",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("requires separate editor, reviewer and publisher roles", async () => {
    await expect(
      service.submit(reviewer as never, "excel-google-sheets-work", {
        reason: "A human editor should submit.",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.review(editor as never, "invalid", {
        reason: "A reviewer must inspect the content.",
        decision: "approve",
        kind: "subject",
        checklist: {},
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.withdraw(editor as never, "invalid", {
        reason: "A publisher must withdraw a release.",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.rollback(reviewer as never, "invalid", {
        reason: "A publisher must restore prior releases.",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
