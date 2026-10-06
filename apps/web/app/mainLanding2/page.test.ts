import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("mainLanding2 page", () => {
  it("renders the SkillUp Premium design from the zip reference", () => {
    expect(source).toContain("/landing/skillup-premium-banner.jpg");
    expect(source).toContain("Learn AI Skills through games for better earning");
    expect(source).toContain("/landing/jazzcash-logo.png");
    expect(source).toContain("Subscribe Now");
    expect(source).toContain("ScrollReveal");
    expect(source).toContain("aboveFold");
    expect(source).toContain("What You Can Learn");
    expect(source).toContain("... and much more");
    expect(source).toContain("Freelancing &");
    expect(source).toContain("se raazi hoon");
  });

  it("routes payment CTA to the product pricing path", () => {
    expect(source).toContain('action="/en/pricing"');
    expect(source).toContain('href="/en/legal/terms"');
    expect(source).toContain('href="/en/legal/privacy"');
  });
});
