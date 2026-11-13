import { describe, expect, it, vi } from "vitest";

import { createContentOperationsService } from "./content-operations.js";

describe("course draft editorial read model", () => {
  it("returns only nonpublished status and counts, never private evaluations", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          slug: "excel-google-sheets-work",
          title: "Excel & Google Sheets for Work",
          status: "draft",
          module_count: 4,
          level_count: 24,
          challenge_count: 72,
          draft_challenges: 72,
          private_evaluation: { correctOptionKeys: ["a"] },
        },
      ],
    });
    const service = createContentOperationsService({
      pool: { query } as never,
      adminService: {} as never,
      releaseSha: "course-draft-test",
    });
    const result = await service.listCourseDrafts();
    expect(result).toEqual([
      {
        slug: "excel-google-sheets-work",
        title: "Excel & Google Sheets for Work",
        status: "draft",
        moduleCount: 4,
        levelCount: 24,
        challengeCount: 72,
        draftChallenges: 72,
        reviewStatus: "not_approved",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("private_evaluation");
    expect(JSON.stringify(result)).not.toContain("correctOptionKeys");
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("s.status in ('draft', 'in_review')");
    expect(sql).not.toContain("private_evaluation");
  });

  it("reports empty drafts without inventing courses", async () => {
    const service = createContentOperationsService({
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } as never,
      adminService: {} as never,
      releaseSha: "course-draft-test",
    });
    expect(await service.listCourseDrafts()).toEqual([]);
  });

  it("creates a private, draft-only reviewer packet including exercise answer logic", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          course_slug: "excel-google-sheets-work",
          course_title: "Excel & Google Sheets for Work",
          module_slug: "useful-formulas",
          module_title: "Useful Formulas",
          level_slug: "calculate-totals",
          level_title: "Calculate totals",
          learning_objective: "Add up a sales list accurately.",
          instructions: "Use SUM on a synthetic sample sales range.",
          challenge_type: "multiple_choice",
          challenge_prompt: "Which formula sums B2 through B8?",
          explanation: "SUM adds the cell range.",
          public_payload: { choices: ["SUM", "COUNT"] },
          private_evaluation: { correctOptionKeys: ["a"] },
        },
      ],
    });
    const service = createContentOperationsService({
      pool: { query } as never,
      adminService: {} as never,
      releaseSha: "review-packet-test",
    });
    const result = await service.getCourseDraftReviewPacket("excel-google-sheets-work");
    expect(result).toMatchObject({
      courseSlug: "excel-google-sheets-work",
      publicationAllowed: false,
      reviewStatus: "subject_and_accessibility_review_pending",
      items: [{ privateEvaluation: { correctOptionKeys: ["a"] } }],
    });
    expect(query.mock.calls[0]?.[1]).toEqual(["excel-google-sheets-work"]);
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("s.status = 'draft'");
    expect(sql).toContain("cv.state = 'draft'");
    expect(sql).toContain("ce.private_evaluation");
    expect(sql).not.toContain("s.status = 'published'");
  });

  it("refuses to fabricate a review packet when the course has no imported draft", async () => {
    const service = createContentOperationsService({
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } as never,
      adminService: {} as never,
      releaseSha: "review-packet-test",
    });
    await expect(service.getCourseDraftReviewPacket("not-imported")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
