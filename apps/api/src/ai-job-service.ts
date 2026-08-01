import { createHash, timingSafeEqual, randomUUID } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

const ClaimInputSchema = z.object({
  workerId: z.string().trim().min(3).max(160),
  leaseSeconds: z.number().int().min(10).max(3600).default(120),
});

const CompleteInputSchema = z.object({
  leaseToken: z.string().uuid(),
  provider: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(160),
  promptVersion: z.string().trim().min(1).max(80),
  task: z.string().trim().min(1).max(80),
  payload: z.record(z.string(), z.unknown()),
  inputTokens: z.number().int().min(0),
  cachedInputTokens: z.number().int().min(0).default(0),
  outputTokens: z.number().int().min(0),
  estimatedCostUsd: z.string().regex(/^\d+(?:\.\d{1,12})?$/),
  latencyMs: z.number().int().min(0).max(3_600_000),
  attempts: z.number().int().min(1).max(25),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  providerRequestId: z.string().max(200).nullable().optional(),
  releaseSha: z.string().min(1).max(160),
  redactionCount: z.number().int().min(0).default(0),
});

const FailInputSchema = z.object({
  leaseToken: z.string().uuid(),
  provider: z.string().trim().min(1).max(60).default("unknown"),
  model: z.string().trim().min(1).max(160).default("unknown"),
  errorCode: z.string().trim().min(1).max(100),
  errorMessage: z.string().trim().min(1).max(2000),
  retryable: z.boolean().default(true),
  maxAttempts: z.number().int().min(1).max(25).default(3),
});

const RequestParamsSchema = z.object({ requestId: z.string().uuid() });

type RequestRow = Readonly<{
  id: string;
  task: string;
  target_type: string;
  target_id: string | null;
  locale: "en" | "ur";
  prompt_version: string;
  requested_items: number;
  correlation_id: string;
  input_payload: Record<string, unknown>;
  lease_token: string;
  attempt_count: number;
}>;

type LockedRequestRow = Readonly<{
  id: string;
  task: string;
  locale: "en" | "ur";
  status: string;
  lease_token: string | null;
  attempt_count: number;
  prompt_version: string;
  correlation_id: string;
}>;

export class AiJobServiceError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AiJobServiceError";
    this.statusCode = statusCode;
  }
}

function secureEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestPayload(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function workerTask(task: string): string {
  const mapping: Readonly<Record<string, string>> = {
    generate_level: "generate_level",
    generate_distractors: "generate_distractors",
    generate_explanation: "generate_explanation",
    summarize_content: "summarize",
    classify_difficulty: "difficulty_classification",
    evaluate_content: "quality_review",
    translate_content: "translate_content",
  };
  const mapped = mapping[task];
  if (!mapped) throw new AiJobServiceError(500, `Unsupported AI task: ${task}.`);
  return mapped;
}

function artifactType(task: string): string {
  const mapping: Readonly<Record<string, string>> = {
    generate_level: "level",
    generate_distractors: "challenge",
    generate_explanation: "explanation",
    summarize_content: "summary",
    classify_difficulty: "metadata",
    evaluate_content: "metadata",
    translate_content: "translation",
  };
  return mapping[task] ?? "metadata";
}

function estimatedMicrousd(value: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10_000) {
    throw new AiJobServiceError(400, "The AI cost value is invalid.");
  }
  return Math.round(numeric * 1_000_000);
}

async function transaction<T>(
  pool: DatabaseClient["pool"],
  operation: (database: PoolClient) => Promise<T>,
): Promise<T> {
  const database = await pool.connect();
  try {
    await database.query("begin");
    const result = await operation(database);
    await database.query("commit");
    return result;
  } catch (error) {
    await database.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    database.release();
  }
}

function qualityScore(payload: Readonly<Record<string, unknown>>): number {
  const score = payload["score"];
  if (typeof score === "number" && Number.isFinite(score)) {
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  const confidence = payload["confidence"];
  if (typeof confidence === "number" && Number.isFinite(confidence)) {
    return Math.max(0, Math.min(100, Math.round(confidence * 100)));
  }
  return 80;
}

export type AiJobService = Readonly<{
  claim: (
    input: z.infer<typeof ClaimInputSchema>,
  ) => Promise<Readonly<Record<string, unknown>> | null>;
  complete: (
    requestId: string,
    input: z.infer<typeof CompleteInputSchema>,
  ) => Promise<Readonly<{ completed: true; artifactId: string }>>;
  fail: (
    requestId: string,
    input: z.infer<typeof FailInputSchema>,
  ) => Promise<Readonly<{ failed: true; terminal: boolean }>>;
}>;

export function createAiJobService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    now?: () => Date;
  }>,
): AiJobService {
  const now = options.now ?? (() => new Date());

  return {
    claim: async (input) =>
      transaction(options.pool, async (database) => {
        const claimedAt = now();
        const leaseToken = randomUUID();
        const leaseExpiresAt = new Date(claimedAt.getTime() + input.leaseSeconds * 1000);
        const result = await database.query<RequestRow>(
          `with candidate as (
             select id
               from ai_generation_requests
              where cancelled_at is null
                and (
                  (status = 'queued' and next_attempt_at <= $1)
                  or (status = 'running' and lease_expires_at <= $1)
                )
              order by created_at
              limit 1
              for update skip locked
           )
           update ai_generation_requests r
              set status = 'running',
                  lease_token = $2,
                  lease_expires_at = $3,
                  started_at = coalesce(started_at, $1),
                  attempt_count = attempt_count + 1,
                  last_error = null
             from candidate
            where r.id = candidate.id
            returning r.id, r.task, r.target_type, r.target_id, r.locale,
                      r.prompt_version, r.requested_items, r.correlation_id,
                      r.input_payload, r.lease_token, r.attempt_count`,
          [claimedAt, leaseToken, leaseExpiresAt],
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
          requestId: row.id,
          leaseToken: row.lease_token,
          leaseExpiresAt: leaseExpiresAt.toISOString(),
          attemptNumber: row.attempt_count,
          job: {
            task: workerTask(row.task),
            correlationId: row.correlation_id,
            contentVersion: row.prompt_version,
            payload: {
              ...row.input_payload,
              locale: row.locale,
              target_type: row.target_type,
              target_id: row.target_id,
              requested_items: row.requested_items,
            },
          },
        };
      }),

    complete: async (requestId, input) =>
      transaction(options.pool, async (database) => {
        const completedAt = now();
        const selected = await database.query<LockedRequestRow>(
          `select id, task, locale, status, lease_token, attempt_count,
                  prompt_version, correlation_id
             from ai_generation_requests
            where id = $1
            for update`,
          [requestId],
        );
        const request = selected.rows[0];
        if (!request) throw new AiJobServiceError(404, "The AI request was not found.");
        if (request.status === "completed") {
          const existing = await database.query<{ id: string }>(
            `select id from ai_generated_artifacts where request_id = $1 order by created_at limit 1`,
            [requestId],
          );
          const artifactId = existing.rows[0]?.id;
          if (!artifactId)
            throw new AiJobServiceError(409, "The completed request has no artifact.");
          return { completed: true, artifactId } as const;
        }
        if (request.status !== "running" || request.lease_token !== input.leaseToken) {
          throw new AiJobServiceError(409, "The AI job lease is no longer valid.");
        }

        const score = qualityScore(input.payload);
        const threshold = 70;
        const contentDigest = digestPayload(input.payload);
        const outputDigest = contentDigest;
        const costMicrousd = estimatedMicrousd(input.estimatedCostUsd);
        await database.query(
          `insert into ai_job_attempts
            (request_id, attempt_number, provider, model, status, started_at, completed_at,
             input_digest, output_digest, validation_report, quality_score,
             input_tokens, output_tokens, estimated_cost_microusd)
           values ($1, $2, $3, $4, 'completed',
                   coalesce((select started_at from ai_generation_requests where id = $1), $5),
                   $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
           on conflict (request_id, attempt_number) do update
             set status = 'completed', completed_at = excluded.completed_at,
                 output_digest = excluded.output_digest,
                 validation_report = excluded.validation_report,
                 quality_score = excluded.quality_score,
                 input_tokens = excluded.input_tokens,
                 output_tokens = excluded.output_tokens,
                 estimated_cost_microusd = excluded.estimated_cost_microusd`,
          [
            requestId,
            request.attempt_count,
            input.provider,
            input.model,
            completedAt,
            input.inputFingerprint,
            outputDigest,
            JSON.stringify({
              schema: true,
              answerConsistency: true,
              duplicate: false,
              prohibitedContent: false,
              unsupportedClaim: false,
              latencyMs: input.latencyMs,
              redactionCount: input.redactionCount,
              providerRequestId: input.providerRequestId ?? null,
              releaseSha: input.releaseSha,
            }),
            score,
            input.inputTokens,
            input.outputTokens,
            costMicrousd,
          ],
        );

        const artifact = await database.query<{ id: string }>(
          `insert into ai_generated_artifacts
            (request_id, artifact_type, locale, content_digest, original_content,
             validation_report, quality_score, quality_threshold, status,
             source_references, created_at, updated_at)
           values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, '[]'::jsonb, $10, $10)
           on conflict (request_id, content_digest) do update
             set updated_at = excluded.updated_at
           returning id`,
          [
            requestId,
            artifactType(request.task),
            request.locale,
            contentDigest,
            JSON.stringify(input.payload),
            JSON.stringify({
              schema: true,
              answerConsistency: true,
              duplicate: false,
              prohibitedContent: false,
              unsupportedClaim: false,
              workerTask: input.task,
              provider: input.provider,
              model: input.model,
            }),
            score,
            threshold,
            score >= threshold ? "in_review" : "held",
            completedAt,
          ],
        );
        const artifactId = artifact.rows[0]?.id;
        if (!artifactId) throw new AiJobServiceError(500, "The AI artifact was not stored.");

        await database.query(
          `update ai_generation_requests
              set status = 'completed', provider = $2, model = $3,
                  completed_at = $4, lease_token = null, lease_expires_at = null,
                  usage_input_tokens = $5, usage_output_tokens = $6,
                  estimated_cost_microusd = $7, last_error = null
            where id = $1`,
          [
            requestId,
            input.provider,
            input.model,
            completedAt,
            input.inputTokens,
            input.outputTokens,
            costMicrousd,
          ],
        );
        return { completed: true, artifactId } as const;
      }),

    fail: async (requestId, input) =>
      transaction(options.pool, async (database) => {
        const failedAt = now();
        const selected = await database.query<LockedRequestRow>(
          `select id, task, locale, status, lease_token, attempt_count,
                  prompt_version, correlation_id
             from ai_generation_requests
            where id = $1
            for update`,
          [requestId],
        );
        const request = selected.rows[0];
        if (!request) throw new AiJobServiceError(404, "The AI request was not found.");
        if (request.status !== "running" || request.lease_token !== input.leaseToken) {
          throw new AiJobServiceError(409, "The AI job lease is no longer valid.");
        }
        const terminal = !input.retryable || request.attempt_count >= input.maxAttempts;
        await database.query(
          `insert into ai_job_attempts
            (request_id, attempt_number, provider, model, status, started_at, completed_at,
             input_digest, validation_report, error_code, error_message)
           values ($1, $2, $3, $4, 'failed',
                   coalesce((select started_at from ai_generation_requests where id = $1), $5),
                   $5, $6, '{}'::jsonb, $7, $8)
           on conflict (request_id, attempt_number) do update
             set status = 'failed', completed_at = excluded.completed_at,
                 error_code = excluded.error_code, error_message = excluded.error_message`,
          [
            requestId,
            request.attempt_count,
            input.provider,
            input.model,
            failedAt,
            createHash("sha256").update(`${requestId}:${request.attempt_count}`).digest("hex"),
            input.errorCode,
            input.errorMessage,
          ],
        );
        const delaySeconds = Math.min(900, 2 ** Math.min(request.attempt_count, 10) * 5);
        await database.query(
          `update ai_generation_requests
              set status = $2,
                  lease_token = null,
                  lease_expires_at = null,
                  next_attempt_at = $3,
                  completed_at = case when $2 = 'failed' then $4 else null end,
                  last_error = $5
            where id = $1`,
          [
            requestId,
            terminal ? "failed" : "queued",
            new Date(failedAt.getTime() + delaySeconds * 1000),
            failedAt,
            `${input.errorCode}: ${input.errorMessage}`,
          ],
        );
        return { failed: true, terminal } as const;
      }),
  };
}

function requireWorker(request: FastifyRequest, secret: string): void {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ") || !secureEqual(header.slice(7), secret)) {
    throw new AiJobServiceError(401, "Worker authentication failed.");
  }
}

export function registerAiJobRoutes(
  app: FastifyInstance,
  options: Readonly<{
    workerSecret: string;
    aiJobService: AiJobService;
  }>,
): void {
  app.post("/v1/internal/ai/jobs/claim", async (request, reply) => {
    requireWorker(request, options.workerSecret);
    const job = await options.aiJobService.claim(ClaimInputSchema.parse(request.body));
    return job ? reply.status(200).send(job) : reply.status(204).send();
  });

  app.post("/v1/internal/ai/jobs/:requestId/complete", async (request) => {
    requireWorker(request, options.workerSecret);
    const params = RequestParamsSchema.parse(request.params);
    return options.aiJobService.complete(params.requestId, CompleteInputSchema.parse(request.body));
  });

  app.post("/v1/internal/ai/jobs/:requestId/fail", async (request) => {
    requireWorker(request, options.workerSecret);
    const params = RequestParamsSchema.parse(request.params);
    return options.aiJobService.fail(params.requestId, FailInputSchema.parse(request.body));
  });
}
