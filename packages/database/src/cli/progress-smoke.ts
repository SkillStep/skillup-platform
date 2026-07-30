import type { PoolClient } from "pg";

import { createDatabaseClient, requireDatabaseUrl } from "../index.js";
import { pilotLearningSeed } from "../pilot-learning-seed.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-progress-db-smoke",
  maxConnections: 2,
});

async function expectPostgresFailure(
  database: PoolClient,
  label: string,
  expectedMessage: string,
  operation: () => Promise<void>,
): Promise<void> {
  await database.query("savepoint progress_failure");
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
    await database.query("rollback to savepoint progress_failure");
  }

  if (!receivedExpectedFailure) throw new Error(`${label} unexpectedly succeeded.`);
}

try {
  if (!(await client.ping())) throw new Error("PostgreSQL ping failed.");

  const seeded = await client.pool.query<{ badges: number }>(
    "select count(*)::int as badges from badge_definitions",
  );
  if (seeded.rows[0]?.badges !== 4) {
    throw new Error(`Expected four reviewed badge definitions: ${JSON.stringify(seeded.rows[0])}`);
  }

  const database = await client.pool.connect();
  try {
    await database.query("begin");

    const userId = "abababab-abab-4aba-8aba-ababababab01";
    const sessionId = "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcd01";
    const completedAt = new Date("2026-07-30T12:00:00.000Z");

    await database.query("insert into users (id, status) values ($1, 'active')", [userId]);
    await database.query(
      `insert into level_play_sessions
        (id, user_id, level_id, level_version_id, state, current_challenge_ordinal,
         awarded_points, max_points, started_at, last_activity_at, expires_at)
       values ($1, $2, $3, $4, 'active', 0, 0, 20,
               $5::timestamptz, $5::timestamptz, $5::timestamptz + interval '1 day')`,
      [
        sessionId,
        userId,
        pilotLearningSeed.level.id,
        pilotLearningSeed.level.versionId,
        new Date("2026-07-30T11:55:00.000Z"),
      ],
    );

    const enrolled = await database.query<{
      state: string;
      leaderboard_opt_in: boolean;
      timezone: string;
    }>(
      `select le.state, lps.leaderboard_opt_in, lps.timezone
         from learner_enrollments le
         join learner_progress_settings lps on lps.user_id = le.user_id
        where le.user_id = $1 and le.level_id = $2`,
      [userId, pilotLearningSeed.level.id],
    );
    if (
      enrolled.rows[0]?.state !== "in_progress" ||
      enrolled.rows[0].leaderboard_opt_in !== false ||
      enrolled.rows[0].timezone !== "UTC"
    ) {
      throw new Error(
        `Session enrollment/privacy defaults were not derived: ${JSON.stringify(enrolled.rows[0])}`,
      );
    }

    await database.query(
      `update level_play_sessions
          set state = 'completed',
              current_challenge_ordinal = 2,
              awarded_points = 20,
              completed_at = $2,
              last_activity_at = $2
        where id = $1`,
      [sessionId, completedAt],
    );

    const reward = await database.query<{
      points: number;
      streak: number;
      events: number;
      badges: number;
      enrollment_state: string;
    }>(
      `select
         (select coalesce(sum(points_delta), 0)::int from points_ledger where user_id = $1) as points,
         (select current_days from learner_streaks where user_id = $1) as streak,
         (select count(*)::int from streak_events where user_id = $1) as events,
         (select count(*)::int from learner_badge_events where user_id = $1 and action = 'unlocked') as badges,
         (select state from learner_enrollments where user_id = $1 and level_id = $2) as enrollment_state`,
      [userId, pilotLearningSeed.level.id],
    );
    const rewardRow = reward.rows[0];
    if (
      rewardRow?.points !== 20 ||
      rewardRow.streak !== 1 ||
      rewardRow.events !== 1 ||
      rewardRow.badges !== 2 ||
      rewardRow.enrollment_state !== "completed"
    ) {
      throw new Error(
        `Verified completion rewards were not derived correctly: ${JSON.stringify(rewardRow)}`,
      );
    }

    await database.query("update level_play_sessions set last_activity_at = $2 where id = $1", [
      sessionId,
      new Date("2026-07-30T12:05:00.000Z"),
    ]);
    const duplicateCounts = await database.query<{
      ledger: number;
      streaks: number;
      badges: number;
    }>(
      `select
         (select count(*)::int from points_ledger where user_id = $1) as ledger,
         (select count(*)::int from streak_events where user_id = $1) as streaks,
         (select count(*)::int from learner_badge_events where user_id = $1) as badges`,
      [userId],
    );
    if (
      duplicateCounts.rows[0]?.ledger !== 1 ||
      duplicateCounts.rows[0].streaks !== 1 ||
      duplicateCounts.rows[0].badges !== 2
    ) {
      throw new Error(
        `Completed-session replay inflated rewards: ${JSON.stringify(duplicateCounts.rows[0])}`,
      );
    }

    await expectPostgresFailure(
      database,
      "Correction metadata guard",
      "points_ledger_correction_metadata",
      async () => {
        await database.query(
          `insert into points_ledger
            (user_id, event_key, source_type, points_delta, reason_code, explanation, occurred_at)
           values ($1, 'invalid-correction-event', 'correction', -5,
                   'manual_correction', 'Invalid correction without its original entry.', now())`,
          [userId],
        );
      },
    );

    await database.query("rollback");
  } finally {
    database.release();
  }

  console.log(
    "SkillUp progress database smoke passed (private enrollment, append-only points, streak and badge idempotency verified).",
  );
} finally {
  await client.close();
}
