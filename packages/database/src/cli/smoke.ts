import { count, eq } from "drizzle-orm";

import {
  createDatabaseClient,
  learningPaths,
  requireDatabaseUrl,
  skills,
  skillVersions,
} from "../index.js";
import { launchCatalogSeed } from "../seed-data.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-db-smoke",
  maxConnections: 2,
});

try {
  if (!(await client.ping())) throw new Error("PostgreSQL ping failed.");

  const [skillCount] = await client.db.select({ value: count() }).from(skills);
  const [pathCount] = await client.db.select({ value: count() }).from(learningPaths);
  const publishedSkills = await client.db
    .select({ slug: skills.slug })
    .from(skills)
    .where(eq(skills.status, "published"));
  const pilotVersions = await client.db
    .select({ title: skillVersions.title, version: skillVersions.version })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, launchCatalogSeed[0].skill.id));

  if (skillCount?.value !== launchCatalogSeed.length) {
    throw new Error(
      `Expected ${launchCatalogSeed.length} seeded skills, found ${skillCount?.value ?? 0}.`,
    );
  }

  if (pathCount?.value !== launchCatalogSeed.length) {
    throw new Error(
      `Expected ${launchCatalogSeed.length} seeded paths, found ${pathCount?.value ?? 0}.`,
    );
  }

  if (
    publishedSkills.length !== 1 ||
    publishedSkills[0]?.slug !== "interview-workplace-communication"
  ) {
    throw new Error("Exactly the reviewed interview/workplace pilot must be published.");
  }

  if (
    pilotVersions.length !== 1 ||
    pilotVersions[0]?.title !== "Interview and Workplace Communication" ||
    pilotVersions[0]?.version !== 1
  ) {
    throw new Error("The immutable pilot skill version is missing or invalid.");
  }

  console.log(
    `SkillUp database smoke passed (${skillCount.value} skills, ${pathCount.value} paths, one published pilot).`,
  );
} finally {
  await client.close();
}
