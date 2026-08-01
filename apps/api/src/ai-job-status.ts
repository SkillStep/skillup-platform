import { createHash, timingSafeEqual } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiJobServiceError } from "./ai-job-service.js";

const RequestParamsSchema = z.object({ requestId: z.string().uuid() });
const LeaseQuerySchema = z.object({ leaseToken: z.string().uuid() });

type StatusRow = Readonly<{
  status: string;
  lease_token: string | null;
  cancelled_at: Date | null;
}>;

function secureEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function requireWorker(request: FastifyRequest, secret: string): void {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ") || !secureEqual(header.slice(7), secret)) {
    throw new AiJobServiceError(401, "Worker authentication failed.");
  }
}

export type AiJobStatusService = Readonly<{
  status: (
    requestId: string,
    leaseToken: string,
  ) => Promise<Readonly<{ active: boolean; cancelled: boolean }>>;
}>;

export function createAiJobStatusService(
  options: Readonly<{ pool: DatabaseClient["pool"] }>,
): AiJobStatusService {
  return {
    status: async (requestId, leaseToken) => {
      const result = await options.pool.query<StatusRow>(
        `select status, lease_token, cancelled_at
           from ai_generation_requests
          where id = $1`,
        [requestId],
      );
      const row = result.rows[0];
      if (!row) throw new AiJobServiceError(404, "The AI request was not found.");
      if (!row.lease_token || !secureEqual(row.lease_token, leaseToken)) {
        throw new AiJobServiceError(409, "The AI job lease is no longer valid.");
      }
      return {
        active: row.status === "running" && row.cancelled_at === null,
        cancelled: row.cancelled_at !== null || row.status === "cancelled",
      };
    },
  };
}

export function registerAiJobStatusRoutes(
  app: FastifyInstance,
  options: Readonly<{
    workerSecret: string;
    statusService: AiJobStatusService;
  }>,
): void {
  app.get("/v1/internal/ai/jobs/:requestId/status", async (request) => {
    requireWorker(request, options.workerSecret);
    const params = RequestParamsSchema.parse(request.params);
    const query = LeaseQuerySchema.parse(request.query);
    return options.statusService.status(params.requestId, query.leaseToken);
  });
}
