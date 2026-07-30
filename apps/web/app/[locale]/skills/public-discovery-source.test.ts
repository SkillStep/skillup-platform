import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const catalogPage = source("./page.tsx");
const skillPage = source("./[slug]/page.tsx");
const pathPage = source("../paths/[slug]/page.tsx");
const categoryPage = source("../categories/launch-skills/page.tsx");
const sitemap = source("../../sitemap.ts");
const robots = source("../../robots.ts");

describe("public discovery source boundaries", () => {
  it("renders meaningful public content and navigation from the reviewed catalog", () => {
    expect(catalogPage).toContain("Choose one practical skill to improve.");
    expect(catalogPage).toContain("<SkillSearch skills={publicSkills} />");
    expect(skillPage).toContain("What you will practice");
    expect(skillPage).toContain("Editorial boundary:");
    expect(pathPage).toContain("Learning outcomes");
    expect(pathPage).toContain("Publication standard");
    expect(categoryPage).toContain("launchCategory.summary");
  });

  it("generates canonical metadata and visible-content-matched structured data", () => {
    for (const page of [catalogPage, skillPage, pathPage, categoryPage]) {
      expect(page).toContain("canonicalUrl(publicAppUrl");
      expect(page).toContain("<JsonLd");
      expect(page).toContain('"@type": "BreadcrumbList"');
    }
    expect(catalogPage).toContain('"@type": "ItemList"');
    expect(skillPage).toContain('"@type": "LearningResource"');
    expect(pathPage).toContain('"@type": "Course"');
    expect(categoryPage).toContain('"@type": "CollectionPage"');
  });

  it("includes public catalog routes in discovery files and excludes private routes", () => {
    expect(sitemap).toContain('`/skills/${skill.slug}`');
    expect(sitemap).toContain('`/paths/${skill.slug}`');
    expect(sitemap).toContain('`/categories/${launchCategory.slug}`');
    for (const privatePath of [
      "/en/sign-in",
      "/en/onboarding",
      "/en/progress",
      "/en/learn",
    ]) {
      expect(robots).toContain(`"${privatePath}"`);
    }
  });

  it("does not project private learner or protected evaluation fields", () => {
    const combined = [catalogPage, skillPage, pathPage, categoryPage].join("\n");
    for (const forbidden of [
      "emailDisplay",
      "learningGoal",
      "ageBand",
      "privateEvaluation",
      "correctOptionKeys",
      "sessionToken",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });
});
