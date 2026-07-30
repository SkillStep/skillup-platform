import { count, eq } from "drizzle-orm";

import {
  createDatabaseClient,
  learningPaths,
  requireDatabaseUrl,
  skills,
  skillVersions,
} from "../index.js";
import { launchCatalogSeed } from "../seed-data.js";

const pilotSeed = launchCatalogSeed.find((item) => item.skill.status === "published");
if (!pilotSeed) throw new Error("A published pilot seed is required.");

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
    .where(eq(skillVersions.skillId, pilotSeed.skill.id));

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

  const identityCounts = await client.pool.query<{
    users: number;
    identities: number;
    challenges: number;
    sessions: number;
    profiles: number;
  }>(`select
      (select count(*)::int from users) as users,
      (select count(*)::int from user_email_identities) as identities,
      (select count(*)::int from auth_challenges) as challenges,
      (select count(*)::int from auth_sessions) as sessions,
      (select count(*)::int from learner_profiles) as profiles`);
  const identity = identityCounts.rows[0];
  if (
    identity?.users !== 0 ||
    identity.identities !== 0 ||
    identity.challenges !== 0 ||
    identity.sessions !== 0 ||
    identity.profiles !== 0
  ) {
    throw new Error(
      "Identity tables must exist and remain empty after the synthetic catalog seed.",
    );
  }

  console.log(
    `SkillUp database smoke passed (${skillCount.value} skills, ${pathCount.value} paths, one published pilot, secure identity schema ready).`,
  );
} finally {
  await client.close();
}
