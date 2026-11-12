import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import {
  PUBLISHED_COURSES_SQL,
  createPublishedCourseCatalogService,
  projectPublishedCourses,
  registerPublishedCourseCatalogRoutes,
} from "./course-catalog.js";

const first = {
  skill_slug: "excel-for-work",
  title: "Excel for Work",
  summary: "A reviewed practical Excel course with a useful outcome and relevant challenges.",
  path_slug: "excel-for-work",
  module_id: "module-a",
  module_title: "Clean Data",
  level_id: "level-a",
  level_title: "Review order records",
  level_minutes: 8,
  challenge_type: "multiple_choice",
  objective_statement: "Identify missing order records in a spreadsheet",
};
const second = {
  ...first,
  module_id: "module-b",
  module_title: "Useful Formulas",
  level_id: "level-b",
  level_title: "Use SUMIF",
  level_minutes: 10,
  challenge_type: "fill_blank",
  objective_statement: "Sum the correct category of transactions",
};

describe("published-only course catalogue", () => {
  it("does not double count challenge rows or expose private answer keys", () => {
    const courses = projectPublishedCourses([
      first,
      { ...first, challenge_type: "scenario" },
      second,
    ]);
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({
      slug: "excel-for-work",
      levelId: "level-a",
      moduleCount: 2,
      levelCount: 2,
      estimatedMinutes: 18,
      modules: ["Clean Data", "Useful Formulas"],
      challengeTypes: ["Multiple choice", "Scenario decisions", "Fill in the blank"],
    });
    expect(JSON.stringify(courses)).not.toContain("correctOptionKeys");
    expect(JSON.stringify(courses)).not.toContain("privateEvaluation");
  });

  it("rejects draft and incomplete publication states at every SQL join", () => {
    expect(PUBLISHED_COURSES_SQL).toContain("s.status = 'published'");
    expect(PUBLISHED_COURSES_SQL).toContain("v.status = 'published'");
    expect((PUBLISHED_COURSES_SQL.match(/v.state = 'published'/g) ?? []).length).toBe(4);
    expect(PUBLISHED_COURSES_SQL).toContain("challenge_evaluations");
    expect(PUBLISHED_COURSES_SQL).toContain("v.reviewed_at is not null");
    expect(PUBLISHED_COURSES_SQL).toContain("v.published_at <= now()");
    expect(PUBLISHED_COURSES_SQL).not.toContain("private_evaluation as");
  });

  it("serves only the database projection and validates locale", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [first, second] });
    const service = createPublishedCourseCatalogService({
      pool: { query } as never,
    });
    const app = Fastify();
    registerPublishedCourseCatalogRoutes(app, { service });
    const response = await app.inject({ method: "GET", url: "/v1/catalog/courses" });
    expect(response.statusCode).toBe(200);
    expect(response.json().courses).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(PUBLISHED_COURSES_SQL, ["en"]);
    const invalid = await app.inject({
      method: "GET",
      url: "/v1/catalog/courses?locale=invalid",
    });
    expect(invalid.statusCode).toBe(500);
    expect(query).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("fails closed on empty database projection", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = createPublishedCourseCatalogService({ pool: { query } as never });
    expect(await service.list("en")).toEqual([]);
  });
});
