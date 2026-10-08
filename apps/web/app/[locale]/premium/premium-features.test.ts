import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./premium-features.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Premium Features page", () => {
  it("gates Premium Features behind sign-in then entitlement", () => {
    expect(pageSource).toContain("Premium Features");
    expect(pageSource).toContain("robots: { index: false");
    expect(source).toContain('withReturnTo("/en/sign-in", "/en/premium")');
    expect(source).toContain('window.location.assign("/en/pricing")');
    expect(source).toContain("Your unlocked features");
  });
});
