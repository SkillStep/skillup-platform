import { randomUUID } from "node:crypto";

import { ApiErrorSchema, ServiceHealthSchema } from "@skillup/contracts";
import Fastify, { type FastifyInstance } from "fastify";

import { type ApiConfig, readApiConfig } from "./config.js";

export type BuildApiOptions = Readonly<{
  config?: ApiConfig;
  now?: () => Date;
}>;

export function buildApi(options: BuildApiOptions = {}): FastifyInstance {
  const config = options.config ?? readApiConfig();
  const now = options.now ?? (() => new Date());

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
                "otp",
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

  app.get("/v1/ready", async () =>
    ServiceHealthSchema.parse({
      status: "ok",
      service: "skillup-api",
      version: "0.0.0",
      releaseSha: config.RELEASE_SHA,
      timestamp: now().toISOString(),
    }),
  );

  app.get("/v1/version", async () => ({
    service: "skillup-api",
    version: "0.0.0",
    releaseSha: config.RELEASE_SHA,
  }));

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

    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    const message = statusCode < 500 ? error.message : "An unexpected server error occurred.";

    return reply.status(statusCode).send(
      ApiErrorSchema.parse({
        code: statusCode < 500 ? "request_error" : "internal_error",
        message,
        requestId: request.id,
      }),
    );
  });

  return app;
}
