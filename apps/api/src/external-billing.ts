import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import type { AuthService } from "./auth.js";
import type { ApiConfig } from "./config.js";
import {
  type ExternalPaymentClient,
  type ExternalPaymentPlan,
  type ExternalPaymentStatus,
  type ExternalSubscription,
  ExternalPaymentRequestError,
} from "./external-payment-client.js";
import {
  launchPaymentServicePlans,
  paymentServicePlanMatches,
} from "./payment-service-plan-catalog.js";
import { requireAuthenticatedLearner, requireTrustedRequestOrigin } from "./request-auth.js";

const LocalPlanCodeSchema = z.enum(["premium-monthly", "premium-yearly"]);
const LinkWalletSchema = z
  .object({
    planCode: LocalPlanCodeSchema,
    msisdn: z.string().regex(/^\d{11,15}$/),
    consentToAutoPay: z.literal(true),
  })
  .strict();
const CreateSubscriptionSchema = z
  .object({
    planCode: LocalPlanCodeSchema,
    skipTrial: z.boolean().optional(),
  })
  .strict();
const SubscriptionParamsSchema = z.object({ subscriptionId: z.string().min(1).max(256) });
const PaymentParamsSchema = z.object({ paymentId: z.string().min(1).max(256) });

const PaymentWebhookTypeSchema = z.enum([
  "wallet.linked",
  "wallet.unlinked",
  "subscription.created",
  "subscription.activated",
  "subscription.renewed",
  "subscription.past_due",
  "subscription.payment_failed",
  "subscription.expired",
  "subscription.canceled",
  "payment.pending",
  "payment.completed",
  "payment.failed",
  "payment.refunded",
]);
const PaymentWebhookSchema = z
  .object({
    eventId: z.string().min(1).max(200),
    type: PaymentWebhookTypeSchema,
    userId: z.string().uuid(),
    createdAt: z.string().datetime(),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

type LocalPlanCode = z.infer<typeof LocalPlanCodeSchema>;
type PaymentWebhook = z.infer<typeof PaymentWebhookSchema>;

type BillingPlan = Readonly<{
  localCode: LocalPlanCode;
  externalCode: string;
  interval: "monthly" | "yearly";
  fullAmountMinor: number;
  stepAmountMinor: number;
  trialHours: number;
  currency: "PKR";
  launchReady: boolean;
}>;

type EntitlementRow = Readonly<{
  id: string;
  status: string;
  ends_at: Date;
}>;

type SubscriptionStateRow = Readonly<{
  entitlement_id: string | null;
  last_event_created_at: Date | null;
}>;

type ExistingWebhookRow = Readonly<{
  event_type: string;
  user_id: string;
  payload_digest: string;
  processing_status: string;
}>;

type AccessDecision = Readonly<{
  mode: "active" | "grace" | "none";
  endsAt: Date | null;
  subscription: ExternalSubscription | null;
}>;

export type ExternalBillingService = Readonly<{
  listPlans: () => Promise<readonly BillingPlan[]>;
  linkWallet: (input: Readonly<{
    userId: string;
    planCode: LocalPlanCode;
    msisdn: string;
  }>) => ReturnType<ExternalPaymentClient["linkWallet"]>;
  getWallet: (userId: string) => ReturnType<ExternalPaymentClient["getWallet"]>;
  unlinkWallet: (userId: string) => ReturnType<ExternalPaymentClient["unlinkWallet"]>;
  getStatus: (userId: string) => Promise<ExternalPaymentStatus>;
  createSubscription: (input: Readonly<{
    userId: string;
    planCode: LocalPlanCode;
    skipTrial?: boolean;
  }>) => ReturnType<ExternalPaymentClient["createSubscription"]>;
  cancelSubscription: (userId: string, subscriptionId: string) => Promise<unknown>;
  listPayments: (userId: string) => ReturnType<ExternalPaymentClient["listPayments"]>;
  getPayment: (userId: string, paymentId: string) => ReturnType<ExternalPaymentClient["getPayment"]>;
  handleWebhook: (input: Readonly<{
    rawBody: Buffer;
    signature: string | undefined;
    eventHeader: string | undefined;
  }>) => Promise<Readonly<{ duplicate: boolean; stale: boolean }>>;
}>;

class BillingRequestError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;

  constructor(statusCode: number, errorCode: string, message: string) {
    super(message);
    this.name = "BillingRequestError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

function launchPlan(config: ApiConfig, localCode: LocalPlanCode) {
  const plan = launchPaymentServicePlans(config).find((candidate) => candidate.localCode === localCode);
  if (!plan) throw new Error(`Missing launch plan ${localCode}.`);
  return plan;
}

function localPlanCode(config: ApiConfig, externalCode: string): LocalPlanCode {
  const match = launchPaymentServicePlans(config).find(
    (candidate) => candidate.external.code === externalCode,
  );
  if (!match) {
    throw new BillingRequestError(
      409,
      "unknown_payment_plan",
      "The payment service returned a plan that SkillUp does not recognize.",
    );
  }
  return match.localCode;
}

function appReturnUrl(config: ApiConfig): string {
  return (
    config.PAYMENT_SERVICE_APP_RETURN_URL ??
    new URL("/en/account?billingReturn=1", config.PUBLIC_APP_URL).toString()
  );
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validWebhookSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature.toLowerCase(), "hex"));
}

function payloadDigest(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function accessForSubscription(
  subscription: ExternalSubscription,
  status: ExternalPaymentStatus,
  now: Date,
): AccessDecision {
  const periodEnd = dateOrNull(subscription.current_period_end);
  const trialEnd = dateOrNull(subscription.trial_ends_at);

  if (subscription.status === "trialing" && trialEnd && trialEnd > now) {
    return { mode: "active", endsAt: trialEnd, subscription };
  }
  if (
    subscription.status === "active" &&
    status.status.current_period_paid &&
    periodEnd &&
    periodEnd > now
  ) {
    return { mode: "active", endsAt: periodEnd, subscription };
  }
  if (
    (subscription.status === "past_due" || subscription.status === "paused") &&
    periodEnd &&
    periodEnd > now
  ) {
    return { mode: "grace", endsAt: periodEnd, subscription };
  }
  if (subscription.status === "canceled" && periodEnd && periodEnd > now) {
    return { mode: "active", endsAt: periodEnd, subscription };
  }
  return { mode: "none", endsAt: null, subscription };
}

function subscriptionTimestamp(subscription: ExternalSubscription): number {
  return Math.max(
    dateOrNull(subscription.current_period_end)?.valueOf() ?? 0,
    dateOrNull(subscription.trial_ends_at)?.valueOf() ?? 0,
    dateOrNull(subscription.next_due_at)?.valueOf() ?? 0,
  );
}

function chooseAccess(status: ExternalPaymentStatus, now: Date): AccessDecision {
  if (status.status.last_payment_status === "refunded") {
    const refunded = [...status.subscriptions].sort(
      (left, right) => subscriptionTimestamp(right) - subscriptionTimestamp(left),
    )[0] ?? null;
    return { mode: "none", endsAt: null, subscription: refunded };
  }

  const decisions = status.subscriptions
    .map((subscription) => accessForSubscription(subscription, status, now))
    .filter((decision) => decision.mode !== "none" && decision.endsAt);

  decisions.sort((left, right) => {
    const leftRank = left.mode === "active" ? 2 : 1;
    const rightRank = right.mode === "active" ? 2 : 1;
    if (leftRank !== rightRank) return rightRank - leftRank;
    return (right.endsAt?.valueOf() ?? 0) - (left.endsAt?.valueOf() ?? 0);
  });
  const entitled = decisions[0];
  if (entitled) return entitled;

  const openStatuses = new Set(["initiated", "trialing", "active", "past_due", "paused"]);
  const primary =
    status.subscriptions.find((subscription) => openStatuses.has(subscription.status)) ??
    [...status.subscriptions].sort(
      (left, right) => subscriptionTimestamp(right) - subscriptionTimestamp(left),
    )[0] ??
    null;
  return { mode: "none", endsAt: null, subscription: primary };
}

function assertSubscriptionLaunchContract(config: ApiConfig, subscription: ExternalSubscription): LocalPlanCode {
  const localCode = localPlanCode(config, subscription.plan_code);
  const expected = launchPlan(config, localCode).external;
  if (
    subscription.amount_minor !== expected.fullAmountMinor ||
    (subscription.step_amount_minor ?? subscription.amount_minor) !== expected.stepAmountMinor ||
    subscription.currency !== "PKR" ||
    subscription.interval !== expected.interval
  ) {
    throw new BillingRequestError(
      409,
      "payment_subscription_mismatch",
      "The payment-service subscription does not match SkillUp launch pricing.",
    );
  }
  return localCode;
}

async function markWebhook(
  pool: DatabaseClient["pool"],
  event: PaymentWebhook,
  rawBody: Buffer,
): Promise<Readonly<{ duplicate: boolean }>> {
  const digest = payloadDigest(rawBody);
  const inserted = await pool.query(
    `insert into payment_service_webhook_events (
       event_id, event_type, user_id, event_created_at, payload_digest, signature_verified
     )
     select $1, $2, u.id, $3::timestamptz, $4, true
       from users u
      where u.id = $5::uuid
     on conflict (event_id) do nothing`,
    [event.eventId, event.type, event.createdAt, digest, event.userId],
  );
  if (inserted.rowCount === 1) return { duplicate: false };

  const existing = await pool.query<ExistingWebhookRow>(
    `select event_type, user_id::text as user_id, payload_digest, processing_status
       from payment_service_webhook_events
      where event_id = $1`,
    [event.eventId],
  );
  const row = existing.rows[0];
  if (!row) {
    throw new BillingRequestError(404, "unknown_payment_user", "The payment user does not exist.");
  }
  if (row.event_type !== event.type || row.user_id !== event.userId || row.payload_digest !== digest) {
    throw new BillingRequestError(
      409,
      "payment_event_id_conflict",
      "The payment event ID was reused with different signed content.",
    );
  }
  return {
    duplicate: row.processing_status === "processed" || row.processing_status === "ignored_stale",
  };
}

async function finishWebhook(
  pool: DatabaseClient["pool"],
  eventId: string,
  processingStatus: "processed" | "ignored_stale" | "failed",
  errorCode: string | null,
  now: Date,
): Promise<void> {
  await pool.query(
    `update payment_service_webhook_events
        set processing_status = $2,
            error_code = $3,
            processed_at = $4
      where event_id = $1`,
    [eventId, processingStatus, errorCode, now],
  );
}

function terminalEntitlementState(status: ExternalPaymentStatus, subscription: ExternalSubscription | null) {
  if (status.status.last_payment_status === "refunded") {
    return { status: "refunded", action: "refund" } as const;
  }
  if (subscription?.status === "expired" || subscription?.status === "canceled") {
    return { status: "expired", action: "expire" } as const;
  }
  return { status: "revoked", action: "revoke" } as const;
}

export function createExternalBillingService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    config: ApiConfig;
    client: ExternalPaymentClient;
    now?: () => Date;
  }>,
): ExternalBillingService {
  const now = options.now ?? (() => new Date());

  async function listPlans(): Promise<readonly BillingPlan[]> {
    const actual = await options.client.listPlans();
    return launchPaymentServicePlans(options.config).map(({ localCode, external }) => ({
      localCode,
      externalCode: external.code,
      interval: external.interval as "monthly" | "yearly",
      fullAmountMinor: external.fullAmountMinor,
      stepAmountMinor: external.stepAmountMinor,
      trialHours: external.trialHours ?? 0,
      currency: "PKR",
      launchReady: paymentServicePlanMatches(
        external,
        actual.find((plan) => plan.code === external.code),
      ),
    }));
  }

  async function ensurePlanReady(localCode: LocalPlanCode): Promise<ExternalPaymentPlan> {
    const expected = launchPlan(options.config, localCode).external;
    const catalog = await options.client.listPlans();
    const actual = catalog.find((plan) => plan.code === expected.code);
    if (!actual || !paymentServicePlanMatches(expected, actual)) {
      throw new BillingRequestError(
        503,
        "payment_plan_not_ready",
        "The selected Premium plan is not ready for billing.",
      );
    }
    return actual;
  }

  async function reconcileStatus(
    userId: string,
    status: ExternalPaymentStatus,
    input: Readonly<{ eventCreatedAt?: Date; reason: string }>,
  ): Promise<Readonly<{ stale: boolean }>> {
    const connection = await options.pool.connect();
    const synchronizedAt = now();
    const access = chooseAccess(status, synchronizedAt);
    const subscription = access.subscription;

    try {
      await connection.query("begin");
      await connection.query(
        `insert into payment_service_subscription_state (user_id)
         values ($1)
         on conflict (user_id) do nothing`,
        [userId],
      );
      const locked = await connection.query<SubscriptionStateRow>(
        `select entitlement_id, last_event_created_at
           from payment_service_subscription_state
          where user_id = $1
          for update`,
        [userId],
      );
      const state = locked.rows[0];
      if (!state) throw new Error("The payment-service subscription state could not be locked.");

      if (
        input.eventCreatedAt &&
        state.last_event_created_at &&
        input.eventCreatedAt < state.last_event_created_at
      ) {
        await connection.query("commit");
        return { stale: true };
      }

      let entitlementId = state.entitlement_id;
      let existingEntitlement: EntitlementRow | null = null;
      if (entitlementId) {
        const entitlement = await connection.query<EntitlementRow>(
          `select id, status, ends_at from entitlements where id = $1 for update`,
          [entitlementId],
        );
        existingEntitlement = entitlement.rows[0] ?? null;
      }

      let planVersionId: string | null = null;
      if (access.mode !== "none" && access.endsAt && subscription) {
        const localCode = assertSubscriptionLaunchContract(options.config, subscription);
        if (subscription.status === "trialing") {
          await ensurePlanReady(localCode);
        }
        const plan = await connection.query<{ plan_version_id: string }>(
          `select plan_version_id
             from active_commercial_plan_catalog
            where code = $1`,
          [localCode],
        );
        planVersionId = plan.rows[0]?.plan_version_id ?? null;
        if (!planVersionId) {
          throw new BillingRequestError(
            409,
            "local_plan_unavailable",
            "The matching SkillUp Premium plan is not active.",
          );
        }

        const nextStatus = access.mode === "grace" ? "grace" : "active";
        if (!existingEntitlement) {
          const inserted = await connection.query<{ id: string }>(
            `insert into entitlements (
               user_id, plan_version_id, source_order_id, status, starts_at, ends_at,
               grace_ends_at, created_at, updated_at
             )
             values ($1, $2, null, $3, $4, $5, $6, $4, $4)
             returning id`,
            [
              userId,
              planVersionId,
              nextStatus,
              synchronizedAt,
              access.endsAt,
              nextStatus === "grace" ? access.endsAt : null,
            ],
          );
          entitlementId = inserted.rows[0]?.id ?? null;
          if (!entitlementId) throw new Error("The payment entitlement could not be created.");
          await connection.query(
            `insert into entitlement_events (
               entitlement_id, action, actor_type, reason, previous_status, next_status, evidence_reference
             ) values ($1, 'activate', 'system', $2, null, $3, $4)`,
            [entitlementId, input.reason, nextStatus, subscription.id],
          );
        } else {
          const action =
            ["revoked", "refunded", "expired", "cancelled"].includes(existingEntitlement.status)
              ? "reactivate"
              : existingEntitlement.status === "grace" && nextStatus === "active"
                ? "reactivate"
                : nextStatus === "grace"
                  ? "grace"
                  : access.endsAt > existingEntitlement.ends_at
                    ? "extend"
                    : "correct";
          await connection.query(
            `update entitlements
                set plan_version_id = $2,
                    status = $3,
                    ends_at = $4,
                    grace_ends_at = $5,
                    cancelled_at = null,
                    revoked_at = null,
                    updated_at = $6
              where id = $1`,
            [
              existingEntitlement.id,
              planVersionId,
              nextStatus,
              access.endsAt,
              nextStatus === "grace" ? access.endsAt : null,
              synchronizedAt,
            ],
          );
          if (
            existingEntitlement.status !== nextStatus ||
            existingEntitlement.ends_at.valueOf() !== access.endsAt.valueOf()
          ) {
            await connection.query(
              `insert into entitlement_events (
                 entitlement_id, action, actor_type, reason, previous_status, next_status, evidence_reference
               ) values ($1, $2, 'system', $3, $4, $5, $6)`,
              [
                existingEntitlement.id,
                action,
                input.reason,
                existingEntitlement.status,
                nextStatus,
                subscription.id,
              ],
            );
          }
        }
      } else if (
        existingEntitlement &&
        !["refunded", "revoked", "expired"].includes(existingEntitlement.status)
      ) {
        const terminal = terminalEntitlementState(status, subscription);
        await connection.query(
          `update entitlements
              set status = $2,
                  grace_ends_at = null,
                  revoked_at = case when $2 in ('revoked', 'refunded') then $3 else revoked_at end,
                  updated_at = $3
            where id = $1`,
          [existingEntitlement.id, terminal.status, synchronizedAt],
        );
        await connection.query(
          `insert into entitlement_events (
             entitlement_id, action, actor_type, reason, previous_status, next_status, evidence_reference
           ) values ($1, $2, 'system', $3, $4, $5, $6)`,
          [
            existingEntitlement.id,
            terminal.action,
            input.reason,
            existingEntitlement.status,
            terminal.status,
            subscription?.id ?? null,
          ],
        );
      }

      await connection.query(
        `update payment_service_subscription_state
            set external_subscription_id = $2,
                external_plan_code = $3,
                subscription_status = $4,
                wallet_status = $5,
                wallet_msisdn_masked = $6,
                current_period_paid = $7,
                current_period_end = $8,
                trial_ends_at = $9,
                next_due_at = $10,
                last_payment_status = $11,
                entitlement_id = $12,
                last_event_created_at = coalesce($13, last_event_created_at),
                last_synced_at = $14
          where user_id = $1`,
        [
          userId,
          subscription?.id ?? null,
          subscription?.plan_code ?? null,
          subscription?.status ?? status.status.subscription_status,
          status.wallet.status,
          status.wallet.msisdn_masked ?? null,
          status.status.current_period_paid,
          dateOrNull(subscription?.current_period_end),
          dateOrNull(subscription?.trial_ends_at),
          dateOrNull(subscription?.next_due_at ?? status.status.next_due_at),
          status.status.last_payment_status ?? null,
          entitlementId,
          input.eventCreatedAt ?? null,
          synchronizedAt,
        ],
      );

      await connection.query("commit");
      return { stale: false };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async function authoritativeStatus(
    userId: string,
    reason: string,
    eventCreatedAt?: Date,
  ): Promise<ExternalPaymentStatus> {
    const status = await options.client.getStatus(userId);
    await reconcileStatus(userId, status, {
      ...(eventCreatedAt ? { eventCreatedAt } : {}),
      reason,
    });
    return status;
  }

  return {
    listPlans,

    linkWallet: async ({ userId, planCode, msisdn }) => {
      const selected = await ensurePlanReady(planCode);
      return options.client.linkWallet({
        userId,
        msisdn,
        planCode: selected.code,
        appReturnUrl: appReturnUrl(options.config),
      });
    },

    getWallet: (userId) => options.client.getWallet(userId),

    unlinkWallet: async (userId) => {
      const result = await options.client.unlinkWallet(userId);
      await authoritativeStatus(userId, "Payment-service wallet unlink reconciliation").catch(
        () => undefined,
      );
      return result;
    },

    getStatus: (userId) => authoritativeStatus(userId, "Payment-service status reconciliation"),

    createSubscription: async ({ userId, planCode, skipTrial }) => {
      const selected = await ensurePlanReady(planCode);
      return options.client.createSubscription({
        userId,
        planCode: selected.code,
        ...(skipTrial === undefined ? {} : { skipTrial }),
      });
    },

    cancelSubscription: async (userId, subscriptionId) => {
      const status = await options.client.getStatus(userId);
      if (!status.subscriptions.some((subscription) => subscription.id === subscriptionId)) {
        throw new BillingRequestError(404, "not_found", "The subscription was not found.");
      }
      const result = await options.client.cancelSubscription(subscriptionId);
      await authoritativeStatus(
        userId,
        "Payment-service subscription cancellation reconciliation",
      ).catch(() => undefined);
      return result;
    },

    listPayments: (userId) => options.client.listPayments(userId),

    getPayment: async (userId, paymentId) => {
      const ownedPayments = await options.client.listPayments(userId);
      const listed = ownedPayments.find((payment) => payment.id === paymentId);
      if (!listed) throw new BillingRequestError(404, "not_found", "The payment was not found.");
      const detail = await options.client.getPayment(paymentId);
      if (
        detail.id !== listed.id ||
        detail.amount_minor !== listed.amount_minor ||
        detail.currency !== listed.currency
      ) {
        throw new BillingRequestError(
          502,
          "invalid_upstream_response",
          "The payment service returned inconsistent payment details.",
        );
      }
      return detail;
    },

    handleWebhook: async ({ rawBody, signature, eventHeader }) => {
      const secret = options.config.PAYMENT_SERVICE_WEBHOOK_SECRET;
      if (!options.config.FEATURE_PAYMENT_SERVICE_ENABLED || !secret) {
        throw new BillingRequestError(
          503,
          "payment_webhook_disabled",
          "Payment-service webhooks are not configured.",
        );
      }
      if (!validWebhookSignature(rawBody, signature, secret)) {
        throw new BillingRequestError(401, "invalid_payment_signature", "Invalid payment signature.");
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody.toString("utf8")) as unknown;
      } catch {
        throw new BillingRequestError(400, "invalid_payment_event", "Invalid payment event JSON.");
      }
      const parsedEvent = PaymentWebhookSchema.safeParse(parsedBody);
      if (!parsedEvent.success) {
        throw new BillingRequestError(400, "invalid_payment_event", "Invalid payment event body.");
      }
      const event = parsedEvent.data;
      if (eventHeader !== event.type) {
        throw new BillingRequestError(
          400,
          "payment_event_mismatch",
          "The payment event header does not match the signed body.",
        );
      }

      const marked = await markWebhook(options.pool, event, rawBody);
      if (marked.duplicate) return { duplicate: true, stale: false };

      try {
        const eventCreatedAt = new Date(event.createdAt);
        const status = await options.client.getStatus(event.userId);
        const result = await reconcileStatus(event.userId, status, {
          eventCreatedAt,
          reason: `Payment-service event ${event.type}`,
        });
        await finishWebhook(
          options.pool,
          event.eventId,
          result.stale ? "ignored_stale" : "processed",
          null,
          now(),
        );
        return { duplicate: false, stale: result.stale };
      } catch (error) {
        const errorCode =
          error instanceof ExternalPaymentRequestError
            ? error.errorCode
            : error instanceof BillingRequestError
              ? error.errorCode
              : "payment_webhook_processing_failed";
        await finishWebhook(options.pool, event.eventId, "failed", errorCode, now()).catch(
          () => undefined,
        );
        throw error;
      }
    },
  };
}

function sendBillingError(reply: FastifyReply, error: unknown): FastifyReply | null {
  if (error instanceof ExternalPaymentRequestError || error instanceof BillingRequestError) {
    return reply.status(error.statusCode).send({ error: error.errorCode, message: error.message });
  }
  return null;
}

export function registerExternalBillingRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    billingService: ExternalBillingService;
  }>,
): void {
  app.get("/v1/billing/plans", async (_request, reply) => {
    try {
      return await options.billingService.listPlans();
    } catch (error) {
      return sendBillingError(reply, error) ?? Promise.reject(error);
    }
  });

  app.post("/v1/billing/wallets/link", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const body = LinkWalletSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await options.billingService.linkWallet({
          userId: learner.id,
          planCode: body.planCode,
          msisdn: body.msisdn,
        }),
      );
    } catch (error) {
      return sendBillingError(reply, error) ?? Promise.reject(error);
    }
  });

  app.get("/v1/billing/wallet", async (request, reply) => {
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    try {
      return await options.billingService.getWallet(learner.id);
    } catch (error) {
      return sendBillingError(reply, error) ?? Promise.reject(error);
    }
  });

  app.post("/v1/billing/wallet/unlink", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    try {
      return await options.billingService.unlinkWallet(learner.id);
    } catch (error) {
      return sendBillingError(reply, error) ?? Promise.reject(error);
    }
  });

  app.get("/v1/billing/status", async (request, reply) => {
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    try {
      return await options.billingService.getStatus(learner.id);
    } catch (error) {
      return sendBillingError(reply, error) ?? Promise.reject(error);
    }
  });

  app.post("/v1/billing/subscriptions", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const body = CreateSubscriptionSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await options.billingService.createSubscription({
          userId: learner.id,
          planCode: body.planCode,
          ...(body.skipTrial === undefined ? {} : { skipTrial: body.skipTrial }),
        }),
      );
    } catch (error) {
      return sendBillingError(reply, error) ?? Promise.reject(error);
    }
  });

  app.post("/v1/billing/subscriptions/:subscriptionId/cancel", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const { subscriptionId } = SubscriptionParamsSchema.parse(request.params);
    try {
      return await options.billingService.cancelSubscription(learner.id, subscriptionId);
    } catch (error) {
      return sendBillingError(reply, error) ?? Promise.reject(error);
    }
  });

  app.get("/v1/billing/payments", async (request, reply) => {
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    try {
      return await options.billingService.listPayments(learner.id);
    } catch (error) {
      return sendBillingError(reply, error) ?? Promise.reject(error);
    }
  });

  app.get("/v1/billing/payments/:paymentId", async (request, reply) => {
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const { paymentId } = PaymentParamsSchema.parse(request.params);
    try {
      return await options.billingService.getPayment(learner.id, paymentId);
    } catch (error) {
      return sendBillingError(reply, error) ?? Promise.reject(error);
    }
  });

  void app.register(async (scope) => {
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_request, body: Buffer, done) => done(null, body),
    );

    scope.post("/v1/billing/webhook", async (request, reply) => {
      if (!Buffer.isBuffer(request.body)) {
        return reply.status(400).send({
          error: "invalid_payment_event",
          message: "The payment webhook requires a JSON body.",
        });
      }
      try {
        const result = await options.billingService.handleWebhook({
          rawBody: request.body,
          signature: headerValue(request.headers["x-payment-signature"]),
          eventHeader: headerValue(request.headers["x-payment-event"]),
        });
        return reply.status(200).send(result);
      } catch (error) {
        return sendBillingError(reply, error) ?? Promise.reject(error);
      }
    });
  });
}
