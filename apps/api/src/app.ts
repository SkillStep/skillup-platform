import { randomUUID } from "node:crypto";

import { ApiErrorSchema, ServiceHealthSchema } from "@skillup/contracts";
import Fastify, { type FastifyInstance } from "fastify";

import { type AuthService, registerAuthRoutes } from "./auth.js";
import { type ApiConfig, readApiConfig } from "./config.js";
import { type GameplayService, registerGameplayRoutes } from "./gameplay.js";

export type BuildApiOptions = Readonly<{
  config?: ApiConfig;
  now?: () => Date;
  readiness?: () => Promise<boolean>;
  authService?: AuthService | undefined;
  gameplayService?: GameplayService | undefined;
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

  const statusCode =
    candidateStatusCode !== undefined && candidateStatusCode >= 400 && candidateStatusCode < 500
      ? candidateStatusCode
      : 500;

  return {
    statusCode,
    message: statusCode < 500 ? candidateMessage : "An unexpected server error occurred.",
  };
}

export function buildApi(options: BuildApiOptions = {}): FastifyInstance {
  const config = options.config ?? readApiConfig();
  const now = options.now ?? (() => new Date());
  const readiness = options.readiness ?? (async () => true);

  const app = Fastify({
    disableRequestLogging: config.APP_ENV === "test",
    genReqId: () => randomUUID(),
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
              ],
              censor: "[redacted]",
            },
          },
    trustProxy: false,
  });

  app.addHook("onSend", async (_request, reply) => {
    reply.headers({
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
  });

  app.get("/v1/health", async () =>
    ServiceHealthSchema.parse({
      status: "ok",
      service: "skillup-api",
      version: "0.0.0",
      releaseSha: config.RELEASE_SHA,
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
      releaseSha: config.RELEASE_SHA,
      timestamp: now().toISOString(),
    });
  });

  app.get("/v1/version", async () => ({
    service: "skillup-api",
    version: "0.0.0",
    releaseSha: config.RELEASE_SHA,
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
