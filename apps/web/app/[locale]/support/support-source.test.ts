import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("public support contact", () => {
  it("publishes a configurable support email with a safe launch fallback", () => {
    expect(source).toContain('process.env["PUBLIC_SUPPORT_EMAIL"]');
    expect(source).toContain("admin@codistan.org");
    expect(source).toContain("mailto:${supportEmail}");
  });

  it("gives payment and refund users concrete safe instructions", () => {
    expect(source).toContain("payment or refund review");
    expect(source).toContain("merchant reference");
    expect(source).toContain("provider reference");
    expect(source).toContain("Never share your");
  });
});
