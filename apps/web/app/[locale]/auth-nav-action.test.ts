import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./auth-nav-action.tsx", import.meta.url), "utf8");

const nav = readFileSync(new URL("./premium-nav-link.tsx", import.meta.url), "utf8");

describe("public auth navigation", () => {
  it("keeps sign-up entry points for guests", () => {
    expect(source).toContain("/en/sign-up");
    expect(source).toContain("Sign up");
  });

  it("hides Premium nav when the learner has an active paid plan", () => {
    expect(nav).toContain('href={"/en/pricing" as Route}');
    expect(nav).toContain("/api/v1/commercial/account");
    expect(nav).toContain('status === "active" || status === "grace"');
    expect(nav).toContain("hasPremiumUnlockedFlag");
    expect(nav).toContain("return null");
    expect(nav).not.toContain("/en/premium");
  });

  it("keeps Unsubscribe always available in the public header", () => {
    const shell = readFileSync(new URL("./discovery-shell.tsx", import.meta.url), "utf8");
    expect(shell).toContain('href="/en/unsubscribe"');
    expect(shell).toContain(">Unsubscribe<");
    expect(shell.match(/href="\/en\/unsubscribe"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("shows User Profile only after sign-in, with Premium tag when entitled", () => {
    const shell = readFileSync(new URL("./discovery-shell.tsx", import.meta.url), "utf8");
    const profile = readFileSync(new URL("./profile-nav-link.tsx", import.meta.url), "utf8");
    expect(shell).toContain("<ProfileNavLink />");
    expect(profile).toContain("User Profile");
    expect(profile).toContain("Premium");
    expect(profile).toContain("/api/v1/auth/session");
    expect(profile).toContain("if (!ready || !signedIn)");
    expect(profile).toContain("return null");
    expect(profile).toContain("hasPremiumUnlockedFlag");
  });
});
