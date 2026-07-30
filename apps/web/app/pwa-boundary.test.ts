import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const manifest = readFileSync(new URL("./manifest.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

describe("installable PWA privacy boundary", () => {
  it("excludes every private learner surface from service-worker caching", () => {
    for (const prefix of [
      "/api",
      "/admin",
      "/app",
      "/en/sign-in",
      "/en/onboarding",
      "/en/progress",
      "/en/learn",
    ]) {
      expect(serviceWorker).toContain(`"${prefix}"`);
    }
    expect(serviceWorker).toContain('cacheBoundary === "public"');
    expect(serviceWorker).toContain('cacheControl.includes("private")');
    expect(serviceWorker).toContain('cacheControl.includes("no-store")');
    expect(serviceWorker).toContain('robots.includes("noindex")');
  });

  it("declares explicit public caching instead of caching all navigations", () => {
    expect(nextConfig).toContain('X-SkillUp-Cacheable", value: "public"');
    expect(nextConfig).toContain('Cache-Control", value: "private, no-store"');
    expect(serviceWorker).not.toContain("caches.match(event.request).then");
  });

  it("provides install metadata, scalable icons and update controls", () => {
    expect(manifest).toContain('display: "standalone"');
    expect(manifest).toContain('purpose: "maskable"');
    expect(manifest).toContain('url: "/en/skills"');
    expect(layout).toContain("<PwaStatus />");
    expect(serviceWorker).toContain('event.data?.type === "SKIP_WAITING"');
  });
});
