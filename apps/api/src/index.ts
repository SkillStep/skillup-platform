import { createDatabaseClient } from "@skillup/database";

import { createAccountLifecycleService } from "./account-lifecycle-service.js";
import { createAdminService } from "./admin.js";
import { createAnalyticsService } from "./analytics-service.js";
import { buildApi } from "./app.js";
import { createAuthService } from "./auth.js";
import { createCapabilityService } from "./capabilities.js";
import { createCommercialService } from "./commercial.js";
import { readApiConfig } from "./config.js";
import { createConfiguredAuthCodeDelivery } from "./email-delivery.js";
import { createGameplayService } from "./gameplay.js";
import { createProgressService } from "./progress.js";

const config = readApiConfig();
const database = createDatabaseClient({
  connectionString: config.DATABASE_URL,
  maxConnections: config.DATABASE_MAX_CONNECTIONS,
  applicationName: "skillup-api",
});
const authService = createAuthService({
  pool: database.pool,
  secret: config.SESSION_SECRET,
  challengeMinutes: config.AUTH_CHALLENGE_MINUTES,
  sessionIdleMinutes: config.SESSION_IDLE_MINUTES,
  sessionAbsoluteHours: config.SESSION_ABSOLUTE_HOURS,
  delivery: createConfiguredAuthCodeDelivery(config),
});
const gameplayService = createGameplayService({ pool: database.pool });
const progressService = createProgressService({ pool: database.pool });
const commercialService = createCommercialService({ pool: database.pool, config });
const adminService = createAdminService({
  pool: database.pool,
  releaseSha: config.RELEASE_SHA,
});
const capabilityService = createCapabilityService({ pool: database.pool });
const accountLifecycleService = createAccountLifecycleService({
  pool: database.pool,
  sessionSecret: config.SESSION_SECRET,
});
const analyticsService = createAnalyticsService({
  pool: database.pool,
  environment: config.APP_ENV,
  releaseSha: config.RELEASE_SHA,
});
const app = buildApi({
  config,
  readiness: database.ping,
  authService,
  gameplayService,
  progressService,
  commercialService,
  adminService,
  capabilityService,
  accountLifecycleService,
  analyticsService,
});

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
