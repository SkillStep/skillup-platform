import { describe, expect, it } from "vitest";

import { PublicLocaleSchema, ServiceHealthSchema } from "./index.js";

describe("public contracts", () => {
  it("accepts supported locales only", () => {
    expect(PublicLocaleSchema.parse("en")).toBe("en");
    expect(PublicLocaleSchema.parse("ur")).toBe("ur");
    expect(PublicLocaleSchema.safeParse("roman-ur").success).toBe(false);
  });

  it("requires stable non-empty health metadata", () => {
    expect(
      ServiceHealthSchema.parse({
        status: "ok",
        service: "skillup-api",
        version: "0.0.0",
        releaseSha: "local",
        timestamp: "2026-07-30T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "ok", service: "skillup-api" });
  });
});
