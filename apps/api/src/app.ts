import { randomUUID } from "node:crypto";

import { ApiErrorSchema, ServiceHealthSchema } from "@skillup/contracts";
import Fastify, { type FastifyInstance } from "fastify";

import {
  type AccountLifecycleService,
  registerAccountLifecycleRoutes,
} from "./account-lifecycle-service.js";
import { type AdminService, registerAdminRoutes } from "./admin.js";
import { type AnalyticsService, registerAnalyticsRoutes } from "./analytics-service.js";
import { type AuthService, registerAuthRoutes } from "./auth.js";
import { type CapabilityService, registerCapabilityRoutes } from "./capabilities.js";
import { type CommercialService, registerCommercialRoutes } from "./commercial.js";
import { type ApiConfig, readApiConfig } from "./config.js";
import { type GameplayService, registerGameplayRoutes } from "./gameplay.js";
import { type ProgressService, registerProgressRoutes } from "./progress.js";
import { createRateLimitHook, type RateLimitOptions } from "./rate-limit.js";

const API_BODY_LIMIT_BYTES = 128 * 1_024;
const API_REQUEST_TIMEOUT_MS = 15_000;
const API_CONNECTION_TIMEOUT_MS = 10_000;
const API_KEEP_ALIVE_TIMEOUT_MS = 72_000;

export type BuildApiOptions = Readonly<{
  config?: ApiConfig;
  now?: () => Date;
  readiness?: () => Promise<boolean>;
  authService?: AuthService | undefined;
  gameplayService?: GameplayService | undefined;
  progressService?: ProgressService | undefined;
  commercialService?: CommercialService | undefined;
  adminService?: AdminService | undefined;
  capabilityService?: CapabilityService | undefined;
  accountLifecycleService?: AccountLifecycleService | undefined;
  analyticsService?: AnalyticsService | undefined;
  rateLimit?: RateLimitOptions;
}>;

type NormalizedError = Readonly<{
  statusCode: number;
  message: string;
}>;

function normalizeError(error: unknown): NormalizedError {
  let candidateStatusCode: number | undefined;
  let candidateMessage = "The request could not be completed.";

  if (error instanceof Error) {
    candidateMessage = error.message;

    if ("statusCode" in error) {
      const statusCode = (error as Error & { statusCode?: unknown }).statusCode;
      if (typeof statusCode === "number") candidateStatusCode = statusCode;
    }
  }

  if (candidateMessage.includes("daily_free_mission_limit_reached")) {
    return {
      statusCode: 402,
      message: "The daily free mission limit has been reached. Upgrade to continue learning today.",
    };
  }

  const statusCode =
    candidateStatusCode !== undefined && candidateStatusCode >= 400 && candidateStatusCode < 500
      ? candidateStatusCode
      : 500;

  return {
    statusCode,
    message: statusCode < 500 ? candidateMessage : "An unexpected server error occurred.",
  };
}

function isPublicRuntime(config: ApiConfig): boolean {
  return config.APP_ENV === "staging" || config.APP_ENV === "production";
}

function releaseMetadata(config: ApiConfig) {
  return {
    releaseSha: config.RELEASE_SHA,
    pipelineId: config.RELEASE_PIPELINE_ID,
    artifactRef: config.RELEASE_ARTIFACT_REF,
    imageDigest: config.RELEASE_IMAGE_DIGEST,
    rollbackRef: config.ROLLBACK_ARTIFACT_REF,
  } as const;
}

function formUrlEncodedParser(
  _request: unknown,
  body: string,
  done: (error: Error | null, value?: unknown) => void,
): void {
  try {
    const fields: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(body)) {
      if (key.length <= 100 && value.length <= 2_000) fields[key] = value;
    }
    done(null, fields);
  } catch (error) {
    done(error instanceof Error ? error : new Error("Invalid form payload."));
  }
}

export function buildApi(options: BuildApiOptions = {}): FastifyInstance {
  const config = options.config ?? readApiConfig();
  const now = options.now ?? (() => new Date());
  const readiness = options.readiness ?? (async () => true);

  const app = Fastify({
    bodyLimit: API_BODY_LIMIT_BYTES,
    connectionTimeout: API_CONNECTION_TIMEOUT_MS,
    disableRequestLogging: config.APP_ENV === "test",
    genReqId: () => randomUUID(),
    keepAliveTimeout: API_KEEP_ALIVE_TIMEOUT_MS,
    logger:
      config.LOG_LEVEL === "silent"
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "res.headers.set-cookie",
                "password",
                "token",
                "sessionToken",
                "code",
                "otp",
                "secret",
                "secretDigest",
                "pp_Password",
                "pp_SecureHash",
              ],
              censor: "[redacted]",
            },
          },
    maxParamLength: 200,
    requestTimeout: API_REQUEST_TIMEOUT_MS,
    trustProxy: isPublicRuntime(config),
  });

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    formUrlEncodedParser,
  );

  app.addHook(
    "onRequest",
    createRateLimitHook(
      options.rateLimit ?? {
        windowMs: 60_000,
        maxRequests: 120,
        maxEntries: 10_000,
      },
    ),
  );

  app.addHook("onSend", async (_request, reply) => {
    reply.headers({
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-resource-policy": "same-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-dns-prefetch-control": "off",
      "x-frame-options": "DENY",
    });
    if (isPublicRuntime(config)) {
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
  });

  app.get("/v1/health", async () =>
    ServiceHealthSchema.parse({
      status: "ok",
      service: "skillup-api",
      version: "0.0.0",
      ...releaseMetadata(config),
      timestamp: now().toISOString(),
    }),
  );

  app.get("/v1/ready", async (_request, reply) => {
    let databaseReady = false;

    try {
      databaseReady = await readiness();
    } catch {
      databaseReady = false;
    }

    if (!databaseReady) reply.status(503);

    return ServiceHealthSchema.parse({
      status: databaseReady ? "ok" : "degraded",
      service: "skillup-api",
      version: "0.0.0",
      ...releaseMetadata(config),
      timestamp: now().toISOString(),
    });
  });

  app.get("/v1/version", async () => ({
    service: "skillup-api",
    version: "0.0.0",
    ...releaseMetadata(config),
  }));

  if (options.authService) {
    registerAuthRoutes(app, { config, authService: options.authService });
  }
  if (options.authService && options.gameplayService) {
    registerGameplayRoutes(app, {
      config,
      authService: options.authService,
      gameplayService: options.gameplayService,
    });
  }
  if (options.authService && options.progressService) {
    registerProgressRoutes(app, {
      config,
      authService: options.authService,
      progressService: options.progressService,
    });
  }
  if (options.authService && options.commercialService) {
    registerCommercialRoutes(app, {
      config,
      authService: options.authService,
      commercialService: options.commercialService,
    });
  }
  if (options.authService && options.adminService) {
    registerAdminRoutes(app, {
      config,
      authService: options.authService,
      adminService: options.adminService,
    });
  }
  if (options.authService && options.capabilityService) {
    registerCapabilityRoutes(app, {
      config,
      authService: options.authService,
      capabilityService: options.capabilityService,
    });
  }
  if (options.authService && options.accountLifecycleService) {
    registerAccountLifecycleRoutes(app, {
      config,
      authService: options.authService,
      accountLifecycleService: options.accountLifecycleService,
    });
  }
  if (options.authService && options.analyticsService) {
    registerAnalyticsRoutes(app, {
      config,
      authService: options.authService,
      analyticsService: options.analyticsService,
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send(
      ApiErrorSchema.parse({
        code: "not_found",
        message: "The requested API resource was not found.",
        requestId: request.id,
      }),
    );
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ error, requestId: request.id }, "API request failed");
    const normalized = normalizeError(error);

    return reply.status(normalized.statusCode).send(
      ApiErrorSchema.parse({
        code: normalized.statusCode < 500 ? "request_error" : "internal_error",
        message: normalized.message,
        requestId: request.id,
      }),
    );
  });

  return app;
}
