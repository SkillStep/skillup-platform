import { createDatabaseClient } from "@skillup/database";

import { buildApi } from "./app.js";
import { readApiConfig } from "./config.js";

const config = readApiConfig();
const database = createDatabaseClient({
  connectionString: config.DATABASE_URL,
  maxConnections: config.DATABASE_MAX_CONNECTIONS,
  applicationName: "skillup-api",
});
const app = buildApi({ config, readiness: database.ping });

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down SkillUp API");
  await app.close();
  await database.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.fatal({ error }, "SkillUp API failed to start");
  await database.close().catch(() => undefined);
  process.exit(1);
}
