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

  it("redirects learners to account with payment status", () => {
    expect(source).toContain('new URL("/en/account", request.nextUrl.origin)');
    expect(source).toContain('url.searchParams.set("payment", status)');
  });

  it("does not use the retired commercial JazzCash callback for link completion", () => {
    expect(source).not.toContain('"/v1/commercial/jazzcash/callback"');
  });
});
