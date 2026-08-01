import { count, eq } from "drizzle-orm";
import type { PoolClient } from "pg";

import {
  createDatabaseClient,
  learningPaths,
  requireDatabaseUrl,
  skills,
  skillVersions,
} from "../index.js";
import { pilotLearningSeed } from "../pilot-learning-seed.js";
import { launchCatalogSeed } from "../seed-data.js";

const pilotSeed = launchCatalogSeed.find(
  (item) => item.skill.slug === "interview-workplace-communication",
);
if (!pilotSeed) throw new Error("The reviewed interview/workplace seed is required.");

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-db-smoke",
  maxConnections: 2,
});

async function expectPostgresFailure(
  database: PoolClient,
  label: string,
  expectedMessage: string,
  operation: () => Promise<void>,
): Promise<void> {
  await database.query("begin");
  let receivedExpectedFailure = false;

  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      throw new Error(`${label} failed for an unexpected reason: ${message}`);
    }
    receivedExpectedFailure = true;
  } finally {
    await database.query("rollback");
  }

  if (!receivedExpectedFailure) {
    throw new Error(`${label} unexpectedly succeeded.`);
  }
}

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

  const publishedSlugs = new Set(publishedSkills.map((skill) => skill.slug));
  const missingPublishedSkills = launchCatalogSeed
    .map((item) => item.skill.slug)
    .filter((skillSlug) => !publishedSlugs.has(skillSlug));
  if (
    publishedSkills.length !== launchCatalogSeed.length ||
    missingPublishedSkills.length > 0
  ) {
    throw new Error(
      `All reviewed launch skills must be published. Missing: ${missingPublishedSkills.join(", ") || "unexpected count"}.`,
    );
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
    !identity ||
    identity.users !== 0 ||
    identity.identities !== 0 ||
    identity.challenges !== 0 ||
    identity.sessions !== 0 ||
    identity.profiles !== 0
  ) {
    throw new Error(
      "Identity tables must exist and remain empty after the synthetic catalog seed.",
    );
  }

  const domainCounts = await client.pool.query<{
    categories: number;
    modules: number;
    lessons: number;
    levels: number;
    objectives: number;
    challenges: number;
    evaluations: number;
    publications: number;
    forbidden_public_payloads: number;
  }>(`select
      (select count(*)::int from skill_categories) as categories,
      (select count(*)::int from learning_modules) as modules,
      (select count(*)::int from lessons) as lessons,
      (select count(*)::int from levels) as levels,
      (select count(*)::int from learning_objectives) as objectives,
      (select count(*)::int from challenges) as challenges,
      (select count(*)::int from challenge_evaluations) as evaluations,
      (select count(*)::int from content_publication_records) as publications,
      (select count(*)::int from challenge_versions
        where public_payload ?| array[
          'answer', 'answers', 'correctOptionKey', 'correctOptionKeys',
          'correctOrder', 'rubric', 'privateEvaluation'
        ]) as forbidden_public_payloads`);
  const domain = domainCounts.rows[0];
  if (
    !domain ||
    domain.categories < 4 ||
    domain.modules < 1 ||
    domain.lessons < 1 ||
    domain.levels < 1 ||
    domain.objectives < 1 ||
    domain.challenges < pilotLearningSeed.challenges.length ||
    domain.evaluations < pilotLearningSeed.challenges.length ||
    domain.publications < 6 + pilotLearningSeed.challenges.length ||
    domain.forbidden_public_payloads !== 0
  ) {
    throw new Error(
      `The reviewed launch learning hierarchy is incomplete or unsafe: ${JSON.stringify(domain)}`,
    );
  }

  const negativeTestClient = await client.pool.connect();
  try {
    await expectPostgresFailure(
      negativeTestClient,
      "Published challenge mutation guard",
      "cannot be mutated",
      async () => {
        await negativeTestClient.query(
          "update challenge_versions set prompt = 'Silently rewritten published prompt.' where id = $1",
          [pilotLearningSeed.challenges[0].versionId],
        );
      },
    );

    await expectPostgresFailure(
      negativeTestClient,
      "Protected evaluation mutation guard",
      "child records cannot be mutated",
      async () => {
        await negativeTestClient.query(
          "update challenge_evaluations set private_evaluation = $2::jsonb where challenge_version_id = $1",
          [pilotLearningSeed.challenges[0].versionId, JSON.stringify({ answer: "changed" })],
        );
      },
    );

    await expectPostgresFailure(
      negativeTestClient,
      "Duplicate challenge slug guard",
      "challenges_level_slug_unique",
      async () => {
        await negativeTestClient.query(
          "insert into challenges (id, level_id, slug, sort_order) values ($1, $2, $3, 99)",
          [
            "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
            pilotLearningSeed.level.id,
            pilotLearningSeed.challenges[0].slug,
          ],
        );
      },
    );

    await expectPostgresFailure(
      negativeTestClient,
      "Invalid editorial transition guard",
      "Unsupported editorial transition",
      async () => {
        await negativeTestClient.query(
          `insert into skill_category_versions
            (id, category_id, version, locale, title, summary, state, index_policy)
           values ($1, $2, 2, 'en', 'Temporary Career Readiness',
             'Temporary editorial record used only to verify invalid state transitions.',
             'draft', 'noindex')`,
          ["dddddddd-dddd-4ddd-8ddd-ddddddddddd2", pilotLearningSeed.category.id],
        );
        await negativeTestClient.query(
          `update skill_category_versions
              set state = 'published', reviewed_at = now(), published_at = now()
            where id = $1`,
          ["dddddddd-dddd-4ddd-8ddd-ddddddddddd2"],
        );
      },
    );

    await expectPostgresFailure(
      negativeTestClient,
      "Prerequisite cycle guard",
      "prerequisite cycle",
      async () => {
        await negativeTestClient.query(
          `insert into levels (id, lesson_id, slug, sort_order) values
            ($1, $3, 'temporary-level-a', 90),
            ($2, $3, 'temporary-level-b', 91)`,
          [
            "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
            "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",
            pilotLearningSeed.lesson.id,
          ],
        );
        await negativeTestClient.query(
          "insert into level_prerequisites (level_id, prerequisite_level_id) values ($1, $2)",
          ["dddddddd-dddd-4ddd-8ddd-ddddddddddd3", "dddddddd-dddd-4ddd-8ddd-ddddddddddd4"],
        );
        await negativeTestClient.query(
          "insert into level_prerequisites (level_id, prerequisite_level_id) values ($1, $2)",
          ["dddddddd-dddd-4ddd-8ddd-ddddddddddd4", "dddddddd-dddd-4ddd-8ddd-ddddddddddd3"],
        );
      },
    );

    await expectPostgresFailure(
      negativeTestClient,
      "Incomplete challenge publication guard",
      "must have exactly one protected evaluation",
      async () => {
        const challengeId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd5";
        const versionId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd6";
        await negativeTestClient.query(
          "insert into challenges (id, level_id, slug, sort_order) values ($1, $2, 'incomplete-challenge', 98)",
          [challengeId, pilotLearningSeed.level.id],
        );
        await negativeTestClient.query(
          `insert into challenge_versions
            (id, challenge_id, level_version_id, version, locale, type, prompt,
             explanation, public_payload, points, state, reviewed_at)
           values ($1, $2, $3, 1, 'en', 'multiple_choice',
             'This deliberately incomplete challenge must not be published.',
             'The database must reject publication without options and protected evaluation.',
             '{}'::jsonb, 10, 'approved', now())`,
          [versionId, challengeId, pilotLearningSeed.level.versionId],
        );
        await negativeTestClient.query(
          "update challenge_versions set state = 'published', published_at = now() where id = $1",
          [versionId],
        );
        await negativeTestClient.query(
          "set constraints validate_published_challenge_trigger immediate",
        );
      },
    );
  } finally {
    negativeTestClient.release();
  }

  console.log(
    `SkillUp database smoke passed (${skillCount.value} skills, ${pathCount.value} paths, ${domain.challenges} protected launch challenges, version and graph guards verified).`,
  );
} finally {
  await client.close();
}
