import { createHash, timingSafeEqual } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiJobServiceError } from "./ai-job-service.js";

const RequestParamsSchema = z.object({ requestId: z.string().uuid() });
const LeaseQuerySchema = z.object({ leaseToken: z.string().uuid() });
const LeaseBodySchema = LeaseQuerySchema.strict();

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
  acknowledgeCancellation: (
    requestId: string,
    leaseToken: string,
  ) => Promise<Readonly<{ cancelled: true }>>;
}>;

export function createAiJobStatusService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    now?: () => Date;
  }>,
): AiJobStatusService {
  const now = options.now ?? (() => new Date());

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

    acknowledgeCancellation: async (requestId, leaseToken) => {
      const completedAt = now();
      const inputDigest = createHash("sha256").update(`${requestId}:cancelled`).digest("hex");
      const result = await options.pool.query<{ id: string }>(
        `with cancelled as (
           update ai_generation_requests
              set status = 'cancelled',
                  lease_token = null,
                  lease_expires_at = null,
                  completed_at = $3,
                  last_error = 'Cancelled by an authorized operator.'
            where id = $1
              and status = 'running'
              and lease_token = $2
              and cancelled_at is not null
            returning id, attempt_count, coalesce(started_at, $3) as started_at
         ), recorded as (
           insert into ai_job_attempts
             (request_id, attempt_number, provider, model, status, started_at, completed_at,
              input_digest, validation_report, error_code, error_message)
           select id, attempt_count, 'worker', 'cancelled', 'cancelled', started_at, $3,
                  $4, '{}'::jsonb, 'cancelled', 'Cancelled by an authorized operator.'
             from cancelled
           on conflict (request_id, attempt_number) do update
             set status = 'cancelled', completed_at = excluded.completed_at,
                 error_code = excluded.error_code, error_message = excluded.error_message
           returning request_id
         )
         select id from cancelled`,
        [requestId, leaseToken, completedAt, inputDigest],
      );
      if (!result.rows[0]) {
        throw new AiJobServiceError(409, "The cancelled AI job lease is no longer valid.");
      }
      return { cancelled: true };
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

  app.post("/v1/internal/ai/jobs/:requestId/cancelled", async (request) => {
    requireWorker(request, options.workerSecret);
    const params = RequestParamsSchema.parse(request.params);
    const body = LeaseBodySchema.parse(request.body);
    return options.statusService.acknowledgeCancellation(params.requestId, body.leaseToken);
  });
}
