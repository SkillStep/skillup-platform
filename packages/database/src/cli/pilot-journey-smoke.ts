import { createDatabaseClient, requireDatabaseUrl } from "../index.js";
import { pilotLearningSeed } from "../pilot-learning-seed.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-pilot-journey-smoke",
  maxConnections: 2,
});

try {
  if (!(await client.ping())) throw new Error("PostgreSQL ping failed.");

  const database = await client.pool.connect();
  try {
    await database.query("begin");

    const userId = "12121212-1212-4121-8121-121212121212";
    const sessionId = "34343434-3434-4343-8343-343434343434";
    const firstChallenge = pilotLearningSeed.challenges[0];
    const secondChallenge = pilotLearningSeed.challenges[1];
    const startedAt = new Date("2026-07-30T13:00:00.000Z");
    const completedAt = new Date("2026-07-30T13:05:00.000Z");

    if (!firstChallenge || !secondChallenge || pilotLearningSeed.challenges.length !== 2) {
      throw new Error("The reviewed pilot journey must contain exactly two challenges.");
    }

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
        startedAt,
      ],
    );
    await database.query(
      `insert into level_session_challenges
        (session_id, ordinal, challenge_id, challenge_version_id, max_attempts, max_points)
       values
        ($1, 0, $2, $3, 2, 10),
        ($1, 1, $4, $5, 2, 10)`,
      [
        sessionId,
        firstChallenge.id,
        firstChallenge.versionId,
        secondChallenge.id,
        secondChallenge.versionId,
      ],
    );

    await database.query(
      `insert into challenge_attempts
        (session_id, user_id, challenge_id, challenge_version_id, attempt_number,
         idempotency_key, request_hash, response_payload, status, awarded_points,
         max_points, explanation, retry_allowed, evaluated_at)
       values ($1, $2, $3, $4, 1, $5, $6, $7::jsonb, 'correct', 10, 10, $8, false, $9)`,
      [
        sessionId,
        userId,
        firstChallenge.id,
        firstChallenge.versionId,
        "56565656-5656-4565-8565-565656565656",
        "a".repeat(64),
        JSON.stringify({ type: "multiple_choice", selectedOptionKeys: ["evidence"] }),
        firstChallenge.explanation,
        new Date("2026-07-30T13:01:00.000Z"),
      ],
    );
    await database.query(
      `update level_play_sessions
          set current_challenge_ordinal = 1,
              awarded_points = 10,
              last_activity_at = $2
        where id = $1`,
      [sessionId, new Date("2026-07-30T13:01:00.000Z")],
    );

    const resumed = await database.query<{
      state: string;
      ordinal: number;
      challenge_version_id: string;
      enrollment_state: string;
      awarded_points: number;
    }>(
      `select s.state, s.current_challenge_ordinal as ordinal,
              sc.challenge_version_id, e.state as enrollment_state, s.awarded_points
         from level_play_sessions s
         join level_session_challenges sc
           on sc.session_id = s.id and sc.ordinal = s.current_challenge_ordinal
         join learner_enrollments e
           on e.user_id = s.user_id and e.level_id = s.level_id
        where s.id = $1`,
      [sessionId],
    );
    const resumedRow = resumed.rows[0];
    if (
      !resumedRow ||
      resumedRow.state !== "active" ||
      resumedRow.ordinal !== 1 ||
      resumedRow.challenge_version_id !== secondChallenge.versionId ||
      resumedRow.enrollment_state !== "in_progress" ||
      resumedRow.awarded_points !== 10
    ) {
      throw new Error(`The exact pilot session did not resume safely: ${JSON.stringify(resumedRow)}`);
    }

    await database.query(
      `insert into challenge_attempts
        (session_id, user_id, challenge_id, challenge_version_id, attempt_number,
         idempotency_key, request_hash, response_payload, status, awarded_points,
         max_points, explanation, retry_allowed, evaluated_at)
       values ($1, $2, $3, $4, 1, $5, $6, $7::jsonb, 'correct', 10, 10, $8, false, $9)`,
      [
        sessionId,
        userId,
        secondChallenge.id,
        secondChallenge.versionId,
        "78787878-7878-4787-8787-787878787878",
        "b".repeat(64),
        JSON.stringify({
          type: "ordering",
          orderedOptionKeys: ["situation", "action", "result"],
        }),
        secondChallenge.explanation,
        completedAt,
      ],
    );
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
    await database.query(
      `insert into learner_level_progress
        (user_id, level_id, level_version_id, best_awarded_points, max_points,
         completion_count, last_session_id, first_completed_at, last_completed_at, updated_at)
       values ($1, $2, $3, 20, 20, 1, $4, $5, $5, $5)
       on conflict (user_id, level_version_id) do update
         set best_awarded_points = greatest(
               learner_level_progress.best_awarded_points,
               excluded.best_awarded_points
             ),
             max_points = excluded.max_points,
             completion_count = learner_level_progress.completion_count + 1,
             last_session_id = excluded.last_session_id,
             first_completed_at = coalesce(
               learner_level_progress.first_completed_at,
               excluded.first_completed_at
             ),
             last_completed_at = excluded.last_completed_at,
             updated_at = excluded.updated_at`,
      [
        userId,
        pilotLearningSeed.level.id,
        pilotLearningSeed.level.versionId,
        sessionId,
        completedAt,
      ],
    );

    const completion = await database.query<{
      session_state: string;
      progress_points: number;
      max_points: number;
      completion_count: number;
      enrollment_state: string;
      ledger_points: number;
      streak_days: number;
      badge_unlocks: number;
      attempts: number;
    }>(
      `select
         (select state from level_play_sessions where id = $1) as session_state,
         (select best_awarded_points from learner_level_progress
           where user_id = $2 and level_id = $3) as progress_points,
         (select max_points from learner_level_progress
           where user_id = $2 and level_id = $3) as max_points,
         (select completion_count from learner_level_progress
           where user_id = $2 and level_id = $3) as completion_count,
         (select state from learner_enrollments
           where user_id = $2 and level_id = $3) as enrollment_state,
         (select coalesce(sum(points_delta), 0)::int from points_ledger
           where user_id = $2) as ledger_points,
         (select current_days from learner_streaks where user_id = $2) as streak_days,
         (select count(*)::int from learner_badge_events
           where user_id = $2 and action = 'unlocked') as badge_unlocks,
         (select count(*)::int from challenge_attempts where session_id = $1) as attempts`,
      [sessionId, userId, pilotLearningSeed.level.id],
    );
    const completionRow = completion.rows[0];
    if (
      !completionRow ||
      completionRow.session_state !== "completed" ||
      completionRow.progress_points !== 20 ||
      completionRow.max_points !== 20 ||
      completionRow.completion_count !== 1 ||
      completionRow.enrollment_state !== "completed" ||
      completionRow.ledger_points !== 20 ||
      completionRow.streak_days !== 1 ||
      completionRow.badge_unlocks !== 2 ||
      completionRow.attempts !== 2
    ) {
      throw new Error(`The pilot completion evidence is inconsistent: ${JSON.stringify(completionRow)}`);
    }

    await database.query("update level_play_sessions set last_activity_at = $2 where id = $1", [
      sessionId,
      new Date("2026-07-30T13:06:00.000Z"),
    ]);
    const replay = await database.query<{
      ledger: number;
      streaks: number;
      badges: number;
      completions: number;
    }>(
      `select
         (select count(*)::int from points_ledger where user_id = $1) as ledger,
         (select count(*)::int from streak_events where user_id = $1) as streaks,
         (select count(*)::int from learner_badge_events where user_id = $1) as badges,
         (select completion_count from learner_level_progress
           where user_id = $1 and level_id = $2) as completions`,
      [userId, pilotLearningSeed.level.id],
    );
    const replayRow = replay.rows[0];
    if (
      !replayRow ||
      replayRow.ledger !== 1 ||
      replayRow.streaks !== 1 ||
      replayRow.badges !== 2 ||
      replayRow.completions !== 1
    ) {
      throw new Error(`Pilot completion replay duplicated rewards: ${JSON.stringify(replayRow)}`);
    }

    await database.query("rollback");
  } finally {
    database.release();
  }

  console.log(
    "SkillUp pilot journey smoke passed (resume, completion, progress and replay-safe rewards verified).",
  );
} finally {
  await client.close();
}
