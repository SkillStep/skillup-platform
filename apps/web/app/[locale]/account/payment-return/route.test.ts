import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("JazzCash payment return route source boundary", () => {
  it("builds customer redirects from PUBLIC_APP_URL instead of the container origin", () => {
    expect(source).toContain('process.env["PUBLIC_APP_URL"]');
    expect(source).toContain('new URL("/en/account", publicAppOrigin(request))');
    expect(source).not.toContain('new URL("/en/account", request.nextUrl.origin)');
  });

  it("keeps provider callback forwarding server-side and no-store", () => {
    expect(source).toContain('"/v1/commercial/jazzcash/callback"');
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain('redirect: "manual"');
  });
});
