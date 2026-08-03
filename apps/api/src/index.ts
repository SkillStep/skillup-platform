import { createDatabaseClient } from "@skillup/database";

import { createAccountLifecycleService } from "./account-lifecycle-service.js";
import { createAdminService } from "./admin.js";
import { createAiJobService, registerAiJobRoutes } from "./ai-job-service.js";
import { createAiJobStatusService, registerAiJobStatusRoutes } from "./ai-job-status.js";
import { createAnalyticsService } from "./analytics-service.js";
import { buildApi } from "./app.js";
import { createAuthService } from "./auth.js";
import { createCapabilityService } from "./capabilities.js";
import { createCommercialAutomationService } from "./commercial-automation.js";
import { createCommercialService } from "./commercial.js";
import {
  createContentOperationsService,
  registerContentOperationsRoutes,
} from "./content-operations.js";
import { readApiConfig } from "./config.js";
import { createConfiguredAuthCodeDelivery } from "./email-delivery.js";
import { createGameplayService } from "./gameplay.js";
import { createMaintenanceRunner } from "./maintenance.js";
import { registerPremiumReportingRoutes } from "./premium-reporting-routes.js";
import { createPremiumReportingService } from "./premium-reporting-service.js";
import { createProgressService } from "./progress.js";
import { createRecommendationService, registerRecommendationRoutes } from "./recommendations.js";

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
const commercialAutomationService = createCommercialAutomationService({ pool: database.pool });
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
const premiumReportingService = createPremiumReportingService({
  pool: database.pool,
  adminService,
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

registerRecommendationRoutes(app, {
  config,
  authService,
  recommendationService: createRecommendationService({
    pool: database.pool,
    capabilityService,
  }),
});

const contentService = createContentOperationsService({
  pool: database.pool,
  adminService,
  releaseSha: config.RELEASE_SHA,
});
registerContentOperationsRoutes(app, {
  config,
  authService,
  adminService,
  contentService,
});

registerPremiumReportingRoutes(app, {
  config,
  authService,
  adminService,
  reportingService: premiumReportingService,
});

const workerSecret = process.env["AI_WORKER_SHARED_SECRET"]?.trim();
if (workerSecret) {
  registerAiJobRoutes(app, {
    workerSecret,
    aiJobService: createAiJobService({ pool: database.pool }),
  });
  registerAiJobStatusRoutes(app, {
    workerSecret,
    statusService: createAiJobStatusService({ pool: database.pool }),
  });
}

const maintenance = createMaintenanceRunner({
  intervalMs: (config.MAINTENANCE_INTERVAL_SECONDS ?? 60) * 1_000,
  logger: {
    info: (context, message) => app.log.info(context, message),
    error: (context, message) => app.log.error(context, message),
  },
  tasks: [
    {
      name: "commercial-automation",
      run: () => commercialAutomationService.run(100),
    },
    {
      name: "scheduled-plan-activation",
      run: () => premiumReportingService.activateDuePlanVersions(20),
    },
    {
      name: "scheduled-publication",
      run: () => contentService.processScheduled(100),
    },
    {
      name: "account-deletion",
      run: () => accountLifecycleService.processDueDeletions(25),
    },
  ],
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down SkillUp API");
  maintenance.stop();
  await app.close();
  await database.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
  maintenance.start();
} catch (error) {
  app.log.fatal({ error }, "SkillUp API failed to start");
  maintenance.stop();
  await database.close().catch(() => undefined);
  process.exit(1);
}
