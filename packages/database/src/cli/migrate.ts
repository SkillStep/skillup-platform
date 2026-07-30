import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabaseClient, requireDatabaseUrl } from "../index.js";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-db-migrate",
  maxConnections: 1,
});

try {
  await migrate(client.db, { migrationsFolder });
  console.log("SkillUp database migrations applied successfully.");
} finally {
  await client.close();
}
