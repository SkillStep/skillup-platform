import { describe, expect, it } from "vitest";

import { launchCategory, pilotSkill, publicSkill, publicSkills } from "./public-catalog";

describe("reviewed public launch catalog", () => {
  it("contains the five approved launch skills with unique stable slugs", () => {
    expect(publicSkills).toHaveLength(5);
    expect(new Set(publicSkills.map((skill) => skill.slug)).size).toBe(publicSkills.length);
    expect(launchCategory.slug).toBe("launch-skills");
  });

  it("publishes every approved path with a playable identifier and complete structure", () => {
    const pilots = publicSkills.filter((skill) => skill.status === "pilot");
    expect(pilots).toHaveLength(1);
    expect(pilotSkill().levelId).toMatch(/^[0-9a-f-]{36}$/);

    for (const skill of publicSkills) {
      expect(skill.levelId).toMatch(/^[0-9a-f-]{36}$/);
      expect(skill.modules.length).toBeGreaterThanOrEqual(3);
      expect(skill.challengeTypes).toEqual(
        expect.arrayContaining([
          "Multiple choice",
          "True or false",
          "Scenario decisions",
          "Ordering",
          "Matching",
          "Fill in the blank",
          "Short-response practice with review-aware feedback",
        ]),
      );
    }
  });

  it("provides useful outcomes and explicit editorial boundaries", () => {
    for (const skill of publicSkills) {
      expect(skill.summary.length).toBeGreaterThanOrEqual(40);
      expect(skill.outcomes.length).toBeGreaterThanOrEqual(5);
      expect(skill.editorialNote).toBeTruthy();
      expect(skill.reviewCadence.length).toBeGreaterThanOrEqual(20);
      expect(publicSkill(skill.slug)).toEqual(skill);
    }

    expect(publicSkill("practical-english-study-work")?.editorialNote).toContain(
      "does not promise fluency",
    );
    expect(publicSkill("freelancing-foundations")?.editorialNote).toContain(
      "does not make guaranteed-income claims",
    );
  });
});
