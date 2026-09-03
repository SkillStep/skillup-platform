import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

import type { AdminIdentity, AdminService } from "./admin.js";
import type { AuthService } from "./auth.js";
import type { ApiConfig } from "./config.js";
import { premiumAccess } from "./premium-reporting-contract.js";
import {
  RequestAuthorizationError,
  requireAuthenticatedLearner,
  requireTrustedRequestOrigin,
} from "./request-auth.js";

const OrderParamsSchema = z.object({ id: z.string().uuid() });
export const PaymentProviderActionSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    evidenceReference: z.string().trim().min(3).max(500).nullable().optional(),
  })
  .strict();

export type PaymentProviderAction = z.infer<typeof PaymentProviderActionSchema>;

type ProviderJobType = "provider_status" | "provider_refund";

type QueuedPaymentOperation = Readonly<{
  jobId: string | null;
  orderId: string;
  jobType: ProviderJobType;
  state: "queued" | "already_queued" | "already_refunded";
}>;

export type PaymentOperationsService = Readonly<{
  queueStatusInquiry: (
    actor: AdminIdentity,
    orderId: string,
    input: PaymentProviderAction,
    correlationId: string,
  ) => Promise<QueuedPaymentOperation>;
  queueRefund: (
    actor: AdminIdentity,
    orderId: string,
    input: PaymentProviderAction,
    correlationId: string,
  ) => Promise<QueuedPaymentOperation>;
}>;

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

function requestError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export function createPaymentOperationsService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    adminService: AdminService;
  }>,
): PaymentOperationsService {
  const queue = async (
    actor: AdminIdentity,
    orderId: string,
    jobType: ProviderJobType,
    input: PaymentProviderAction,
    correlationId: string,
  ): Promise<QueuedPaymentOperation> => {
    const queued = await transaction(options.pool, async (database) => {
      const order = await database.query<{
        id: string;
        provider: string;
        status: string;
      }>("select id, provider, status from payment_orders where id = $1 for update", [orderId]);
      const row = order.rows[0];
      if (!row) throw requestError(404, "The payment order was not found.");
      if (row.provider !== "jazzcash") {
        throw requestError(409, "Only JazzCash orders can use JazzCash provider operations.");
      }

      if (jobType === "provider_refund") {
        if (row.status === "refunded") {
          return { jobId: null, orderId, jobType, state: "already_refunded" as const };
        }
        if (row.status !== "succeeded") {
          throw requestError(409, "Only a verified successful JazzCash order can be refunded.");
        }
      }

      const existing = await database.query<{ id: string }>(
        `select id
           from commercial_jobs
          where order_id = $1
            and job_type = $2
            and status in ('queued', 'running')
          order by created_at
          limit 1
          for update`,
        [orderId, jobType],
      );
      const existingId = existing.rows[0]?.id;
      if (existingId) {
        return { jobId: existingId, orderId, jobType, state: "already_queued" as const };
      }

      const inserted = await database.query<{ id: string }>(
        `insert into commercial_jobs (job_type, order_id, status, run_after)
         values ($1, $2, 'queued', now())
         returning id`,
        [jobType, orderId],
      );
      const jobId = inserted.rows[0]?.id;
      if (!jobId) throw new Error("The provider operation could not be queued.");
      return { jobId, orderId, jobType, state: "queued" as const };
    });

    await options.adminService.audit({
      actorUserId: actor.userId,
      actorRole: actor.roles[0] ?? null,
      action:
        jobType === "provider_refund"
          ? "payment.provider_refund.request"
          : "payment.provider_status.request",
      targetType: "payment_order",
      targetId: orderId,
      result: "succeeded",
      reason: input.reason,
      correlationId,
      metadata: {
        provider: "jazzcash",
        jobType,
        jobId: queued.jobId,
        state: queued.state,
        evidenceReference: input.evidenceReference ?? null,
      },
    });
    return queued;
  };

  return {
    queueStatusInquiry: (actor, orderId, input, correlationId) =>
      queue(actor, orderId, "provider_status", input, correlationId),
    queueRefund: (actor, orderId, input, correlationId) =>
      queue(actor, orderId, "provider_refund", input, correlationId),
  };
}

async function requirePaymentOperator(
  request: FastifyRequest,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    adminService: AdminService;
  }>,
): Promise<AdminIdentity> {
  const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
  const admin = await options.adminService.resolveIdentity(learner.id);
  if (!admin || !premiumAccess(admin).canReconcilePayments) {
    await options.adminService.audit({
      actorUserId: learner.id,
      actorRole: admin?.roles[0] ?? null,
      action: "payment.reconcile",
      targetType: "admin_route",
      targetId: request.routeOptions.url ?? request.url,
      result: "denied",
      reason: "Missing payment reconciliation capability",
      correlationId: request.id,
    });
    throw new RequestAuthorizationError(403, "Payment operations access is not allowed.");
  }
  return admin;
}

export function registerPaymentOperationsRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    adminService: AdminService;
    paymentOperationsService: PaymentOperationsService;
  }>,
): void {
  app.post("/v1/admin/reports/premium/payments/:id/status-inquiries", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const actor = await requirePaymentOperator(request, options);
    const { id } = OrderParamsSchema.parse(request.params);
    const input = PaymentProviderActionSchema.parse(request.body);
    return reply.status(202).send({
      operation: await options.paymentOperationsService.queueStatusInquiry(
        actor,
        id,
        input,
        request.id,
      ),
    });
  });

  app.post("/v1/admin/reports/premium/payments/:id/refunds", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const actor = await requirePaymentOperator(request, options);
    const { id } = OrderParamsSchema.parse(request.params);
    const input = PaymentProviderActionSchema.parse(request.body);
    return reply.status(202).send({
      operation: await options.paymentOperationsService.queueRefund(actor, id, input, request.id),
    });
  });
}
