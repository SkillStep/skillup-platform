import { createDatabaseClient } from "../packages/database/dist/index.js";
import { createGameplayService } from "../apps/api/dist/gameplay.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for gameplay resume smoke.");

const database = createDatabaseClient({
  connectionString,
  applicationName: "skillup-gameplay-resume-smoke",
  maxConnections: 4,
});

const userId = "17171717-1717-4171-8171-171717171717";
const levelId = "3c315a1a-824a-413e-836d-69a9fc8bad1f";
const startedAt = new Date("2026-07-30T15:00:00.000Z");

try {
  await database.pool.query("insert into users (id, status) values ($1, 'active')", [userId]);

  const gameplay = createGameplayService({
    pool: database.pool,
    now: () => startedAt,
  });

  const [first, concurrent] = await Promise.all([
    gameplay.startLevel(userId, levelId, { locale: "en" }),
    gameplay.startLevel(userId, levelId, { locale: "en" }),
  ]);
  const repeated = await gameplay.startLevel(userId, levelId, { locale: "en" });

  if (first.id !== concurrent.id || first.id !== repeated.id) {
    throw new Error(
      `Repeated or concurrent starts created different sessions: ${JSON.stringify({ first: first.id, concurrent: concurrent.id, repeated: repeated.id })}`,
    );
  }
  if (repeated.state !== "active" || repeated.currentChallengeOrdinal !== 0) {
    throw new Error(
      `The authoritative active session was not resumed safely: ${JSON.stringify(repeated)}`,
    );
  }

  const state = await database.pool.query(
    `select
       (select count(*)::int from level_play_sessions
         where user_id = $1 and level_id = $2 and state = 'active') as active_sessions,
       (select count(*)::int from learning_analytics_events
         where session_id = $3 and event_name = 'level_started') as start_events`,
    [userId, levelId, first.id],
  );
  const row = state.rows[0];
  if (row?.active_sessions !== 1 || row?.start_events !== 1) {
    throw new Error(`Server resume evidence is inconsistent: ${JSON.stringify(row)}`);
  }

  console.log(
    "SkillUp gameplay resume smoke passed (concurrent/repeated starts reuse one authoritative session and one activation event).",
  );
} finally {
  await database.close();
}
