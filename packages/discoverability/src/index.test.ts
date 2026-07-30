import { describe, expect, it } from "vitest";

import { canonicalUrl, isPublicIndexablePath, localizedPath } from "./index.js";

describe("discoverability utilities", () => {
  it("creates stable localized paths and canonical URLs", () => {
    expect(localizedPath("en", "/skills/interview-workplace-communication/")).toBe(
      "/en/skills/interview-workplace-communication",
    );
    expect(canonicalUrl("https://skillup.example/old", "ur", "guides/client-brief")).toBe(
      "https://skillup.example/ur/guides/client-brief",
    );
  });

  it("keeps private product surfaces out of public indexing", () => {
    expect(isPublicIndexablePath("/en/skills/interview-workplace-communication")).toBe(true);
    expect(isPublicIndexablePath("/app/progress")).toBe(false);
    expect(isPublicIndexablePath("/admin/content")).toBe(false);
    expect(isPublicIndexablePath("/api/v1/health")).toBe(false);
  });
});
