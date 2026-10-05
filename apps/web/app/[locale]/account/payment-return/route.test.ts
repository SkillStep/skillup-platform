import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("JazzCash payment return route (wallet-link DOC 2026)", () => {
  it("completes wallet-link via the premium billing API", () => {
    expect(source).toContain('"/v1/premium/billing/jazzcash-v11/link/complete"');
    expect(source).toContain("collectFields");
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain('redirect: "manual"');
  });

  it("redirects learners to the home page with payment status", () => {
    expect(source).toContain('new URL("/en", appOrigin)');
    expect(source).toContain('home.searchParams.set("payment", status)');
    expect(source).toContain("origin: appOrigin");
  });

  it("does not use the retired commercial JazzCash callback for link completion", () => {
    expect(source).not.toContain('"/v1/commercial/jazzcash/callback"');
  });

  it("keeps a plain-text ready probe for non-HTML smoke checks", () => {
    expect(source).toContain("JazzCash return handler ready");
    expect(source).toContain('accept.includes("text/html")');
  });

  it("does not require a browser session to complete the JazzCash return", () => {
    expect(source).not.toContain("stashReturnFields");
    expect(source).not.toContain("skillup_jc_return");
    expect(source).toContain("hasSessionCookie");
  });
});
