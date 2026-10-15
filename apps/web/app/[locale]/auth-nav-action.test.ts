import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./auth-nav-action.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("./discovery-shell.tsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("./premium-nav-link.tsx", import.meta.url), "utf8");

describe("public auth navigation", () => {
  it("shows Sign out when a session exists and clears unlock state on logout", () => {
    expect(shell).toContain("AuthNavAction");
    expect(source).toContain("/api/v1/auth/session");
    expect(source).toContain("/api/v1/auth/logout");
    expect(source).toContain("Sign out");
    expect(source).toContain("clearPremiumUnlockedFlag");
  });

  it("keeps Premium nav on pricing so both plans and Current Plan stay visible", () => {
    expect(nav).toContain('href={"/en/pricing" as Route}');
    expect(nav).not.toContain("/en/premium");
  });
});
