import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./auth-nav-action.tsx", import.meta.url), "utf8");

const nav = readFileSync(new URL("./premium-nav-link.tsx", import.meta.url), "utf8");

describe("public auth navigation", () => {
  it("keeps sign-in entry points", () => {
    expect(source).toContain("/en/sign-in");
    expect(source).toContain("Sign in");
  });

  it("hides Premium nav when the learner has an active paid plan", () => {
    expect(nav).toContain('href={"/en/pricing" as Route}');
    expect(nav).toContain("/api/v1/commercial/account");
    expect(nav).toContain('status === "active" || status === "grace"');
    expect(nav).toContain("hasPremiumUnlockedFlag");
    expect(nav).toContain("return null");
    expect(nav).not.toContain("/en/premium");
  });
});
