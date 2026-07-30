import type { PoolClient } from "pg";

import { createDatabaseClient, requireDatabaseUrl } from "../index.js";
import { pilotLearningSeed } from "../pilot-learning-seed.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-gameplay-db-smoke",
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

  if (!receivedExpectedFailure) throw new Error(`${label} unexpectedly succeeded.`);
}

async function insertSessionFixture(
  database: PoolClient,
  suffix: string,
): Promise<{
  userId: string;
  sessionId: string;
}> {
  const userId = `eeeeeeee-eeee-4eee-8eee-eeeeeeeeee${suffix}`;
  const sessionId = `ffffffff-ffff-4fff-8fff-ffffffffff${suffix}`;

  await database.query("insert into users (id, status) values ($1, 'active')", [userId]);
  await database.query(
    `insert into level_play_sessions
      (id, user_id, level_id, level_version_id, state, current_challenge_ordinal,
       awarded_points, max_points, expires_at)
     values ($1, $2, $3, $4, 'active', 0, 0, 20, now() + interval '1 hour')`,
    [sessionId, userId, pilotLearningSeed.level.id, pilotLearningSeed.level.versionId],
  );
  await database.query(
    `insert into level_session_challenges
      (session_id, ordinal, challenge_id, challenge_version_id, max_attempts, max_points)
     values ($1, 0, $2, $3, 2, 10), ($1, 1, $4, $5, 2, 10)`,
    [
      sessionId,
      pilotLearningSeed.challenges[0].id,
      pilotLearningSeed.challenges[0].versionId,
      pilotLearningSeed.challenges[1].id,
      pilotLearningSeed.challenges[1].versionId,
    ],
  );

  return { userId, sessionId };
}

try {
  if (!(await client.ping())) throw new Error("PostgreSQL ping failed.");

  const counts = await client.pool.query<{
    sessions: number;
    session_challenges: number;
    attempts: number;
    progress: number;
  }>(`select
      (select count(*)::int from level_play_sessions) as sessions,
      (select count(*)::int from level_session_challenges) as session_challenges,
      (select count(*)::int from challenge_attempts) as attempts,
      (select count(*)::int from learner_level_progress) as progress`);
  const row = counts.rows[0];
  if (
    !row ||
    row.sessions !== 0 ||
    row.session_challenges !== 0 ||
    row.attempts !== 0 ||
    row.progress !== 0
  ) {
    throw new Error(`Gameplay tables must be empty after the content seed: ${JSON.stringify(row)}`);
  }

  const database = await client.pool.connect();
  try {
    await database.query("begin");
    const fixture = await insertSessionFixture(database, "01");
    await database.query(
      `insert into challenge_attempts
        (session_id, user_id, challenge_id, challenge_version_id, attempt_number,
         idempotency_key, request_hash, response_payload, status, awarded_points,
         max_points, explanation, retry_allowed)
       values ($1, $2, $3, $4, 1, $5, $6, $7::jsonb, 'correct', 10, 10, $8, false)`,
      [
        fixture.sessionId,
        fixture.userId,
        pilotLearningSeed.challenges[0].id,
        pilotLearningSeed.challenges[0].versionId,
        "dddddddd-dddd-4ddd-8ddd-dddddddddd01",
        "a".repeat(64),
        JSON.stringify({ type: "multiple_choice", selectedOptionKeys: ["evidence"] }),
        pilotLearningSeed.challenges[0].explanation,
      ],
    );
    await database.query(
      `insert into learner_level_progress
        (user_id, level_id, level_version_id, best_awarded_points, max_points,
         completion_count, last_session_id, first_completed_at, last_completed_at)
       values ($1, $2, $3, 10, 20, 1, $4, now(), now())`,
      [
        fixture.userId,
        pilotLearningSeed.level.id,
        pilotLearningSeed.level.versionId,
        fixture.sessionId,
      ],
    );
    await database.query("rollback");

    await expectPostgresFailure(
      database,
      "Duplicate idempotency guard",
      "challenge_attempts_idempotency_unique",
      async () => {
        const duplicateFixture = await insertSessionFixture(database, "02");
        const values = [
          duplicateFixture.sessionId,
          duplicateFixture.userId,
          pilotLearningSeed.challenges[0].id,
          pilotLearningSeed.challenges[0].versionId,
          "dddddddd-dddd-4ddd-8ddd-dddddddddd02",
          "b".repeat(64),
          JSON.stringify({ type: "multiple_choice", selectedOptionKeys: ["claim"] }),
          pilotLearningSeed.challenges[0].explanation,
        ];
        await database.query(
          `insert into challenge_attempts
            (session_id, user_id, challenge_id, challenge_version_id, attempt_number,
             idempotency_key, request_hash, response_payload, status, awarded_points,
             max_points, explanation, retry_allowed)
           values ($1, $2, $3, $4, 1, $5, $6, $7::jsonb, 'incorrect', 0, 10, $8, true)`,
          values,
        );
        await database.query(
          `insert into challenge_attempts
            (session_id, user_id, challenge_id, challenge_version_id, attempt_number,
             idempotency_key, request_hash, response_payload, status, awarded_points,
             max_points, explanation, retry_allowed)
           values ($1, $2, $3, $4, 2, $5, $6, $7::jsonb, 'incorrect', 0, 10, $8, false)`,
          values,
        );
      },
    );

    await expectPostgresFailure(
      database,
      "Unscored review guard",
      "challenge_attempts_review_not_scored",
      async () => {
        const reviewFixture = await insertSessionFixture(database, "03");
        await database.query(
          `insert into challenge_attempts
            (session_id, user_id, challenge_id, challenge_version_id, attempt_number,
             idempotency_key, request_hash, response_payload, status, awarded_points,
             max_points, explanation, retry_allowed)
           values ($1, $2, $3, $4, 1, $5, $6, $7::jsonb, 'needs_review', 5, 10, $8, true)`,
          [
            reviewFixture.sessionId,
            reviewFixture.userId,
            pilotLearningSeed.challenges[0].id,
            pilotLearningSeed.challenges[0].versionId,
            "dddddddd-dddd-4ddd-8ddd-dddddddddd03",
            "c".repeat(64),
            JSON.stringify({ type: "short_response", value: "A draft answer" }),
            "A manual review is required before any score or reward is awarded.",
          ],
        );
      },
    );

    await expectPostgresFailure(
      database,
      "Completed-session metadata guard",
      "level_play_sessions_completion_metadata",
      async () => {
        const userId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04";
        await database.query("insert into users (id, status) values ($1, 'active')", [userId]);
        await database.query(
          `insert into level_play_sessions
            (id, user_id, level_id, level_version_id, state, max_points, expires_at)
           values ($1, $2, $3, $4, 'completed', 20, now() + interval '1 hour')`,
          [
            "ffffffff-ffff-4fff-8fff-ffffffffff04",
            userId,
            pilotLearningSeed.level.id,
            pilotLearningSeed.level.versionId,
          ],
        );
      },
    );
  } finally {
    database.release();
  }

  console.log(
    "SkillUp gameplay database smoke passed (version-pinned sessions, attempts, progress and idempotency guards verified).",
  );
} finally {
  await client.close();
}
