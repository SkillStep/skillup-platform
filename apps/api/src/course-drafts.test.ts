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
});
