import { createDatabaseClient, requireDatabaseUrl } from "../index.js";
import { pilotLearningSeed } from "../pilot-learning-seed.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-analytics-smoke",
  maxConnections: 2,
});

try {
  if (!(await client.ping())) throw new Error("PostgreSQL ping failed.");

  const database = await client.pool.connect();
  try {
    await database.query("begin");

    const userId = "15151515-1515-4151-8151-151515151515";
    const sessionId = "16161616-1616-4161-8161-161616161616";
    const startedAt = new Date("2026-07-30T14:00:00.000Z");
    const completedAt = new Date("2026-07-30T14:05:00.000Z");

    await database.query("insert into users (id, status) values ($1, 'active')", [userId]);
    await database.query(
      `insert into level_play_sessions
        (id, user_id, level_id, level_version_id, state, current_challenge_ordinal,
         awarded_points, max_points, started_at, last_activity_at, expires_at)
       values ($1, $2, $3, $4, 'active', 0, 0, 20,
               $5::timestamptz, $5::timestamptz, $5::timestamptz + interval '1 day')`,
      [sessionId, userId, pilotLearningSeed.level.id, pilotLearningSeed.level.versionId, startedAt],
    );

    const started = await database.query<{
      event_key: string;
      event_name: string;
      session_id: string;
      content_id: string;
      content_version_id: string;
      content_version: number;
      locale: string;
      consent: string;
      occurred_at: Date;
    }>(
      `select event_key, event_name, session_id, content_id, content_version_id,
              content_version, locale, consent, occurred_at
         from learning_analytics_events
        where session_id = $1`,
      [sessionId],
    );
    const startedEvent = started.rows[0];
    if (
      !startedEvent ||
      startedEvent.event_key !== `level_started:${sessionId}` ||
      startedEvent.event_name !== "level_started" ||
      startedEvent.session_id !== sessionId ||
      startedEvent.content_id !== pilotLearningSeed.level.id ||
      startedEvent.content_version_id !== pilotLearningSeed.level.versionId ||
      startedEvent.content_version !== 1 ||
      startedEvent.locale !== "en" ||
      startedEvent.consent !== "essential-only" ||
      startedEvent.occurred_at.toISOString() !== startedAt.toISOString()
    ) {
      throw new Error(
        `The level-started analytics event is inconsistent: ${JSON.stringify(startedEvent)}`,
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

    const events = await database.query<{
      event_key: string;
      event_name: string;
      occurred_at: Date;
    }>(
      `select event_key, event_name, occurred_at
         from learning_analytics_events
        where session_id = $1
        order by occurred_at, event_name`,
      [sessionId],
    );
    if (
      events.rows.length !== 2 ||
      events.rows[0]?.event_name !== "level_started" ||
      events.rows[1]?.event_key !== `level_completed:${sessionId}` ||
      events.rows[1]?.event_name !== "level_completed" ||
      events.rows[1]?.occurred_at.toISOString() !== completedAt.toISOString()
    ) {
      throw new Error(`The pilot analytics funnel is inconsistent: ${JSON.stringify(events.rows)}`);
    }

    await database.query("update level_play_sessions set last_activity_at = $2 where id = $1", [
      sessionId,
      new Date("2026-07-30T14:06:00.000Z"),
    ]);
    const replayCount = await database.query<{ count: number }>(
      "select count(*)::int as count from learning_analytics_events where session_id = $1",
      [sessionId],
    );
    if (replayCount.rows[0]?.count !== 2) {
      throw new Error("Replaying a completed session duplicated analytics events.");
    }

    const columns = await database.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'learning_analytics_events'`,
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));
    for (const forbidden of [
      "user_id",
      "account_id",
      "email",
      "display_name",
      "response_payload",
      "answer",
      "ip_address",
      "user_agent",
    ]) {
      if (columnNames.has(forbidden)) {
        throw new Error(`Pilot analytics must not persist unnecessary personal data: ${forbidden}`);
      }
    }

    await database.query("savepoint analytics_mutation_guard");
    let mutationRejected = false;
    try {
      await database.query(
        "update learning_analytics_events set consent = 'essential-only' where session_id = $1",
        [sessionId],
      );
    } catch {
      mutationRejected = true;
      await database.query("rollback to savepoint analytics_mutation_guard");
    }
    if (!mutationRejected) throw new Error("Learning analytics events must be append-only.");

    await database.query("rollback");
  } finally {
    database.release();
  }

  console.log(
    "SkillUp analytics smoke passed (privacy-safe start/completion events, replay safety and append-only history verified).",
  );
} finally {
  await client.close();
}
