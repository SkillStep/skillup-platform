import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(import.meta.dirname, "../apps/api/src/gameplay.ts");
let source = readFileSync(path, "utf8");

function replaceOnce(needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first === -1) {
    if (source.includes(replacement)) return;
    throw new Error(`Could not find gameplay patch marker: ${label}`);
  }
  if (source.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`Gameplay patch marker is ambiguous: ${label}`);
  }
  source = source.replace(needle, replacement);
}

replaceOnce(
  `        const selected = version.rows[0];
        if (!selected)
          throw new GameplayServiceError(404, "The published level version was not found.");

        const challenges = await database.query<{`,
  `        const selected = version.rows[0];
        if (!selected)
          throw new GameplayServiceError(404, "The published level version was not found.");

        const requestedAt = now();
        await database.query("select id from users where id = $1 for update", [userId]);
        const activeSession = await database.query<SessionRow>(
          \`select id, user_id, level_id, level_version_id, state,
                  current_challenge_ordinal, awarded_points, max_points, started_at, expires_at
             from level_play_sessions
            where user_id = $1 and level_version_id = $2 and state = 'active'
            order by started_at desc
            limit 1
            for update\`,
          [userId, selected.level_version_id],
        );
        const existingSession = activeSession.rows[0];
        if (existingSession) {
          const resumedSession = await expireSessionIfRequired(database, existingSession, requestedAt);
          if (resumedSession.state === "active") {
            return sessionView(database, resumedSession, requestedAt);
          }
        }

        const challenges = await database.query<{`,
  "active session lookup",
);

replaceOnce("        const startedAt = now();", "        const startedAt = requestedAt;", "start time");

writeFileSync(path, source);
console.log("Applied server-authoritative gameplay resume patch.");
