import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(import.meta.dirname, "../apps/api/src/gameplay.ts");
let source = readFileSync(path, "utf8");
const compact =
  "          const resumedSession = await expireSessionIfRequired(database, existingSession, requestedAt);";
const formatted = `          const resumedSession = await expireSessionIfRequired(
            database,
            existingSession,
            requestedAt,
          );`;

if (source.includes(compact)) source = source.replace(compact, formatted);
else if (!source.includes(formatted)) throw new Error("Gameplay resume formatting marker was not found.");

writeFileSync(path, source);
console.log("Applied gameplay resume formatting patch.");
