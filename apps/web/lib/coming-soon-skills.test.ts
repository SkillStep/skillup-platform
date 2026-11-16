import { describe, expect, it } from "vitest";

import { comingSoonSkills, filterUnpublishedPreviews, previewBySlug } from "./coming-soon-skills";

describe("curated five-skill launch previews", () => {
  it("contains only five unique, non-playable curriculum previews", () => {
    expect(comingSoonSkills).toHaveLength(5);
    expect(new Set(comingSoonSkills.map((item) => item.slug)).size).toBe(5);
    expect(comingSoonSkills.every((item) => item.modules.length === 4)).toBe(true);
    expect(comingSoonSkills.every((item) => item.summary.length >= 60)).toBe(true);
    for (const entry of comingSoonSkills) {
      expect(Object.keys(entry)).toEqual([
        "slug",
        "publishedAliases",
        "title",
        "summary",
        "keywords",
        "modules",
      ]);
      expect(entry).not.toHaveProperty("levelId");
      expect(entry).not.toHaveProperty("privateEvaluation");
      expect(entry).not.toHaveProperty("published");
    }
  });

  it("does not duplicate existing draft identities when a course is genuinely published", () => {
    expect(filterUnpublishedPreviews([{ slug: "interview-workplace-communication" }])).toHaveLength(
      5,
    );
    expect(
      filterUnpublishedPreviews([
        { slug: "data-analytics-dashboards" },
        { slug: "ai-automation-no-code-tools" },
      ]).map((item) => item.slug),
    ).toEqual([
      "prompt-engineering-generative-ai",
      "cybersecurity-digital-safety",
      "sales-client-negotiation",
    ]);
    expect(filterUnpublishedPreviews(comingSoonSkills.map(({ slug }) => ({ slug })))).toEqual([]);
  });

  it("does not expose a preview for unknown or constructed slug", () => {
    expect(previewBySlug("cybersecurity-digital-safety")?.title).toBe(
      "Cybersecurity & Digital Safety",
    );
    expect(previewBySlug("../admin")).toBeNull();
    expect(previewBySlug("")).toBeNull();
  });
});
