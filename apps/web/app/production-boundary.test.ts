import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const accessibility = readFileSync(new URL("./accessibility.css", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

describe("web production boundary", () => {
  it("provides a keyboard skip target and keeps mobile navigation reachable", () => {
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('id="main-content"');
    expect(layout).toContain("Skip to main content");
    expect(accessibility).toContain(".skip-link:focus-visible");
    expect(accessibility).toContain(".primary-nav > a:not(.nav-action)");
    expect(accessibility).toContain("display: inline-flex");
    expect(accessibility).toContain("prefers-reduced-motion");
  });

  it("sets defensive browser headers and private cache rules", () => {
    for (const header of [
      "Content-Security-Policy",
      "Cross-Origin-Opener-Policy",
      "Cross-Origin-Resource-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]) {
      expect(nextConfig).toContain(header);
    }
    expect(nextConfig).toContain('Cache-Control", value: "private, no-store"');
    expect(nextConfig).toContain("frame-ancestors 'none'");
    expect(nextConfig).toContain("object-src 'none'");
  });
});
