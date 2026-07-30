import {
  createDatabaseClient,
  learningPaths,
  learningPathVersions,
  requireDatabaseUrl,
  skills,
  skillVersions,
} from "../index.js";
import { launchCatalogSeed } from "../seed-data.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-db-seed",
  maxConnections: 2,
});

const reviewedAt = new Date("2026-07-30T00:00:00.000Z");

try {
  await client.db.transaction(async (transaction) => {
    for (const item of launchCatalogSeed) {
      const isPublished = item.skill.status === "published";

      await transaction
        .insert(skills)
        .values({
          id: item.skill.id,
          slug: item.skill.slug,
          status: item.skill.status,
          defaultLocale: "en",
        })
        .onConflictDoNothing();

      await transaction
        .insert(skillVersions)
        .values({
          id: item.skill.versionId,
          skillId: item.skill.id,
          version: 1,
          locale: "en",
          title: item.skill.title,
          summary: item.skill.summary,
          status: item.skill.status,
          reviewedAt: isPublished ? reviewedAt : null,
          publishedAt: isPublished ? reviewedAt : null,
        })
        .onConflictDoNothing();

      await transaction
        .insert(learningPaths)
        .values({
          id: item.path.id,
          skillId: item.skill.id,
          slug: item.path.slug,
          status: item.path.status,
          sortOrder: item.path.sortOrder,
        })
        .onConflictDoNothing();

      await transaction
        .insert(learningPathVersions)
        .values({
          id: item.path.versionId,
          learningPathId: item.path.id,
          version: 1,
          locale: "en",
          title: item.path.title,
          summary: item.path.summary,
          estimatedMinutes: item.path.estimatedMinutes,
          status: item.path.status,
          reviewedAt: isPublished ? reviewedAt : null,
          publishedAt: isPublished ? reviewedAt : null,
        })
        .onConflictDoNothing();
    }
  });

  console.log(`SkillUp launch catalog seed is present (${launchCatalogSeed.length} skills).`);
} finally {
  await client.close();
}
