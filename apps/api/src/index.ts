import { buildApi } from "./app.js";
import { readApiConfig } from "./config.js";

const config = readApiConfig();
const app = buildApi({ config });

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down SkillUp API");
  await app.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.fatal({ error }, "SkillUp API failed to start");
  process.exit(1);
}
