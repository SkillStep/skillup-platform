import { describe, expect, it } from "vitest";

import { requireDatabaseUrl } from "./index.js";
import { launchCatalogSeed } from "./seed-data.js";

describe("database foundation", () => {
  it("requires a PostgreSQL connection URL", () => {
    expect(() => requireDatabaseUrl({})).toThrow("DATABASE_URL is required");
    expect(() => requireDatabaseUrl({ DATABASE_URL: "https://example.com" })).toThrow(
      "DATABASE_URL must use the postgresql:// or postgres:// protocol",
    );
    expect(
      requireDatabaseUrl({
        DATABASE_URL: "postgresql://skillup_local:local-only@127.0.0.1:5432/skillup",
      }),
    ).toContain("postgresql://");
  });

  it("keeps seed identities and slugs unique", () => {
    const ids = launchCatalogSeed.flatMap((item) => [
      item.skill.id,
      item.skill.versionId,
      item.path.id,
      item.path.versionId,
    ]);
    const slugs = launchCatalogSeed.flatMap((item) => [item.skill.slug, item.path.slug]);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(launchCatalogSeed.filter((item) => item.skill.status === "published")).toHaveLength(1);
  });
});
