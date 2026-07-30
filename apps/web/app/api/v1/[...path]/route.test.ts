import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("same-origin API proxy source boundary", () => {
  it("resolves the upstream at runtime and preserves private caching", () => {
    expect(source).toContain('process.env["API_BASE_URL"]');
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain('headers.set("cache-control", "private, no-store")');
  });

  it("does not forward hop-by-hop host or content-length headers", () => {
    expect(source).toContain('"content-length"');
    expect(source).toContain('"host"');
    expect(source).toContain("requestHeadersToRemove");
  });

  it("returns a bounded upstream error without exposing infrastructure details", () => {
    expect(source).toContain('code: "upstream_unavailable"');
    expect(source).not.toContain("target.toString()");
    expect(source).not.toContain("error.message");
  });
});
