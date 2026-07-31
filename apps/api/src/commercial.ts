import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "./auth.js";
import type { ApiConfig } from "./config.js";
import {
  requireAuthenticatedLearner,
  requireTrustedRequestOrigin,
} from "./request-auth.js";

const CreateOrderSchema = z
  .object({
    planCode: z.enum(["premium-monthly", "premium-yearly"]),
    idempotencyKey: z.string().trim().min(12).max(128),
  })
  .strict();

const OrderParamsSchema = z.object({ orderId: z.string().uuid() });
const OfferEventSchema = z
  .object({
    planCode: z.enum(["premium-monthly", "premium-yearly"]).optional(),
    surface: z.string().trim().min(2).max(80).default("pricing"),
  })
  .strict();

type PaymentStatus =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded";

type Plan = Readonly<{
  code: string;
  name: string;
  planVersionId: string;
  version: number;
  currency: "PKR";
  amountMinor: number;
  billingPeriod: "month" | "year";
  capabilities: readonly string[];
  termsVersion: string;
  checkoutAvailable: boolean;
}>;

type PaymentOrder = Readonly<{
  id: string;
  planCode: string;
  planName: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: "PKR";
  merchantReference: string;
  providerReference: string | null;
  checkoutExpiresAt: string;
  createdAt: string;
}>;

type Entitlement = Readonly<{
  id: string;
  planCode: string;
  status: "active" | "grace" | "expired" | "cancelled" | "refunded" | "revoked";
  startsAt: string;
  endsAt: string;
  graceEndsAt: string | null;
  capabilities: readonly string[];
}>;

type Checkout = Readonly<{
  order: PaymentOrder;
  method: "POST";
  action: string;
  fields: Readonly<Record<string, string>>;
}>;

export type CommercialService = Readonly<{
  listPlans: () => Promise<readonly Plan[]>;
  getAccount: (
    userId: string,
  ) => Promise<Readonly<{ entitlement: Entitlement | null; orders: readonly PaymentOrder[] }>>;
  createOrder: (input: {
    userId: string;
    planCode: "premium-monthly" | "premium-yearly";
    idempotencyKey: string;
  }) => Promise<Checkout>;
  getOrder: (userId: string, orderId: string) => Promise<PaymentOrder>;
  handleJazzCashCallback: (fields: Readonly<Record<string, string>>) => Promise<PaymentOrder>;
  recordOfferView: (input: {
    userId: string | null;
    planCode?: string;
    surface: string;
  }) => Promise<void>;
}>;

class CommercialRequestError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "CommercialRequestError";
    this.statusCode = statusCode;
  }
}

function mapOrder(row: Record<string, unknown>): PaymentOrder {
  if (
    typeof row["id"] !== "string" ||
    typeof row["plan_code"] !== "string" ||
    typeof row["plan_name"] !== "string" ||
    typeof row["status"] !== "string" ||
    typeof row["amount_minor"] !== "number" ||
    typeof row["merchant_reference"] !== "string" ||
    !(row["checkout_expires_at"] instanceof Date) ||
    !(row["created_at"] instanceof Date)
  ) {
    throw new Error("The payment query returned an invalid order.");
  }

  return {
    id: row["id"],
    planCode: row["plan_code"],
    planName: row["plan_name"],
    status: row["status"] as PaymentStatus,
    amountMinor: row["amount_minor"],
    currency: "PKR",
    merchantReference: row["merchant_reference"],
    providerReference:
      typeof row["provider_reference"] === "string" ? row["provider_reference"] : null,
    checkoutExpiresAt: row["checkout_expires_at"].toISOString(),
    createdAt: row["created_at"].toISOString(),
  };
}

function formatJazzCashTimestamp(date: Date): string {
  const parts = [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
    date.getUTCHours().toString().padStart(2, "0"),
    date.getUTCMinutes().toString().padStart(2, "0"),
    date.getUTCSeconds().toString().padStart(2, "0"),
  ];
  return parts.join("");
}

function merchantReference(now: Date): string {
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  return `SU${formatJazzCashTimestamp(now)}${suffix}`;
}

export function jazzCashSecureHash(
  fields: Readonly<Record<string, string>>,
  integritySalt: string,
): string {
  const values = Object.entries(fields)
    .filter(
      ([key, value]) =>
        key !== "pp_SecureHash" && key.startsWith("pp") && value.trim().length > 0,
    )
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, value]) => value);
  const message = [integritySalt, ...values].join("&");
  return createHmac("sha256", integritySalt).update(message, "utf8").digest("hex");
}

export function verifyJazzCashSecureHash(
  fields: Readonly<Record<string, string>>,
  integritySalt: string,
): boolean {
  const presented = fields["pp_SecureHash"]?.trim().toLowerCase() ?? "";
  if (!/^[a-f0-9]{64}$/.test(presented)) return false;
  const expected = jazzCashSecureHash(fields, integritySalt);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(presented, "hex"));
}

function payloadDigest(fields: Readonly<Record<string, string>>): string {
  const normalized = Object.fromEntries(
    Object.entries(fields).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function providerOutcome(responseCode: string): PaymentStatus {
  if (["000", "121", "200"].includes(responseCode)) return "succeeded";
  if (["119", "124", "157", "210"].includes(responseCode)) return "pending";
  if (responseCode === "112") return "cancelled";
  if (responseCode === "116") return "expired";
  if (responseCode === "131") return "refunded";
  return "failed";
}

function createCheckoutFields(
  config: ApiConfig,
  row: Record<string, unknown>,
): Readonly<Record<string, string>> {
  if (
    typeof row["id"] !== "string" ||
    typeof row["plan_code"] !== "string" ||
    typeof row["merchant_reference"] !== "string" ||
    typeof row["amount_minor"] !== "number" ||
    !(row["created_at"] instanceof Date) ||
    !(row["checkout_expires_at"] instanceof Date) ||
    !config.JAZZCASH_MERCHANT_ID ||
    !config.JAZZCASH_PASSWORD ||
    !config.JAZZCASH_INTEGRITY_SALT ||
    !config.JAZZCASH_RETURN_URL
  ) {
    throw new CommercialRequestError(503, "JazzCash checkout is not fully configured.");
  }

  const fields: Record<string, string> = {
    pp_Version: config.JAZZCASH_VERSION,
    pp_TxnType: config.JAZZCASH_TXN_TYPE,
    pp_Language: "EN",
    pp_MerchantID: config.JAZZCASH_MERCHANT_ID,
    pp_Password: config.JAZZCASH_PASSWORD,
    pp_BankID: config.JAZZCASH_BANK_ID,
    pp_ProductID: config.JAZZCASH_PRODUCT_ID,
    pp_TxnRefNo: row["merchant_reference"],
    pp_Amount: row["amount_minor"].toString(),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: formatJazzCashTimestamp(row["created_at"]),
    pp_BillReference: row["merchant_reference"],
    pp_Description: "SkillUp premium membership",
    pp_TxnExpiryDateTime: formatJazzCashTimestamp(row["checkout_expires_at"]),
    pp_ReturnURL: config.JAZZCASH_RETURN_URL,
    ppmpf_1: row["id"],
    ppmpf_2: row["plan_code"],
    ppmpf_3: "launch-v1",
  };
  fields["pp_SecureHash"] = jazzCashSecureHash(fields, config.JAZZCASH_INTEGRITY_SALT);
  return fields;
}

const orderSelect = `select
  o.id,
  p.code as plan_code,
  p.name as plan_name,
  o.status,
  o.amount_minor,
  o.currency,
  o.merchant_reference,
  o.provider_reference,
  o.checkout_expires_at,
  o.created_at
from payment_orders o
join commercial_plan_versions v on v.id = o.plan_version_id
join commercial_plans p on p.id = v.plan_id`;

export function createCommercialService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    config: ApiConfig;
    now?: () => Date;
  }>,
): CommercialService {
  const now = options.now ?? (() => new Date());

  return {
    listPlans: async () => {
      const result = await options.pool.query<{
        code: string;
        name: string;
        plan_version_id: string;
        version: number;
        currency: "PKR";
        amount_minor: number;
        billing_period: "month" | "year";
        capabilities: readonly string[];
        terms_version: string;
      }>(
        `select code, name, plan_version_id, version, currency, amount_minor,
                billing_period, capabilities, terms_version
           from active_commercial_plan_catalog
          order by amount_minor`,
      );

      return result.rows.map((row) => ({
        code: row.code,
        name: row.name,
        planVersionId: row.plan_version_id,
        version: row.version,
        currency: row.currency,
        amountMinor: row.amount_minor,
        billingPeriod: row.billing_period,
        capabilities: row.capabilities,
        termsVersion: row.terms_version,
        checkoutAvailable:
          options.config.FEATURE_PREMIUM_ENABLED &&
          options.config.FEATURE_JAZZCASH_ENABLED &&
          options.config.JAZZCASH_MODE !== "disabled",
      }));
    },

    getAccount: async (userId) => {
      const entitlementResult = await options.pool.query<Record<string, unknown>>(
        `select
           e.id,
           p.code as plan_code,
           e.status,
           e.starts_at,
           e.ends_at,
           e.grace_ends_at,
           v.capabilities
         from active_user_capabilities a
         join entitlements e on e.id = a.entitlement_id
         join commercial_plan_versions v on v.id = e.plan_version_id
         join commercial_plans p on p.id = v.plan_id
         where a.user_id = $1
         order by e.ends_at desc
         limit 1`,
        [userId],
      );
      const row = entitlementResult.rows[0];
      const entitlement: Entitlement | null =
        row &&
        typeof row["id"] === "string" &&
        typeof row["plan_code"] === "string" &&
        typeof row["status"] === "string" &&
        row["starts_at"] instanceof Date &&
        row["ends_at"] instanceof Date &&
        Array.isArray(row["capabilities"])
          ? {
              id: row["id"],
              planCode: row["plan_code"],
              status: row["status"] as Entitlement["status"],
              startsAt: row["starts_at"].toISOString(),
              endsAt: row["ends_at"].toISOString(),
              graceEndsAt:
                row["grace_ends_at"] instanceof Date ? row["grace_ends_at"].toISOString() : null,
              capabilities: row["capabilities"] as readonly string[],
            }
          : null;

      const orders = await options.pool.query<Record<string, unknown>>(
        `${orderSelect}
         where o.user_id = $1
         order by o.created_at desc
         limit 20`,
        [userId],
      );
      return { entitlement, orders: orders.rows.map(mapOrder) };
    },

    createOrder: async ({ userId, planCode, idempotencyKey }) => {
      if (
        !options.config.FEATURE_PREMIUM_ENABLED ||
        !options.config.FEATURE_JAZZCASH_ENABLED ||
        options.config.JAZZCASH_MODE === "disabled" ||
        !options.config.JAZZCASH_PAYMENT_URL
      ) {
        throw new CommercialRequestError(503, "Premium checkout is not enabled yet.");
      }

      const connection = await options.pool.connect();
      try {
        await connection.query("begin");
        const plan = await connection.query<{
          plan_version_id: string;
          amount_minor: number;
          currency: "PKR";
        }>(
          `select plan_version_id, amount_minor, currency
             from active_commercial_plan_catalog
            where code = $1
            for share`,
          [planCode],
        );
        const selected = plan.rows[0];
        if (!selected) {
          throw new CommercialRequestError(404, "The selected premium plan is unavailable.");
        }

        const createdAt = now();
        const checkoutExpiresAt = new Date(
          createdAt.getTime() + options.config.JAZZCASH_CHECKOUT_MINUTES * 60_000,
        );
        const inserted = await connection.query<Record<string, unknown>>(
          `insert into payment_orders (
             user_id,
             plan_version_id,
             provider,
             status,
             amount_minor,
             currency,
             idempotency_key,
             merchant_reference,
             checkout_expires_at,
             created_at,
             updated_at
           )
           values ($1, $2, 'jazzcash', 'pending', $3, $4, $5, $6, $7, $8, $8)
           on conflict (user_id, idempotency_key) do nothing
           returning id`,
          [
            userId,
            selected.plan_version_id,
            selected.amount_minor,
            selected.currency,
            idempotencyKey,
            merchantReference(createdAt),
            checkoutExpiresAt,
            createdAt,
          ],
        );

        const selectedOrder = await connection.query<Record<string, unknown>>(
          `${orderSelect}
           where o.user_id = $1 and o.idempotency_key = $2
           for update`,
          [userId, idempotencyKey],
        );
        const row = selectedOrder.rows[0];
        if (!row) throw new Error("The payment order could not be loaded.");
        if (row["status"] !== "pending" && row["status"] !== "created") {
          throw new CommercialRequestError(409, "This checkout request already reached a final state.");
        }
        if (row["checkout_expires_at"] instanceof Date && row["checkout_expires_at"] <= createdAt) {
          throw new CommercialRequestError(409, "This checkout request has expired.");
        }

        if (inserted.rowCount === 1) {
          await connection.query(
            `insert into commercial_events (user_id, event_name, plan_code, order_id, properties)
             values ($1, 'checkout_started', $2, $3, '{"provider":"jazzcash"}'::jsonb)`,
            [userId, planCode, row["id"]],
          );
        }

        await connection.query("commit");
        return {
          order: mapOrder(row),
          method: "POST",
          action: options.config.JAZZCASH_PAYMENT_URL,
          fields: createCheckoutFields(options.config, row),
        };
      } catch (error) {
        await connection.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    },

    getOrder: async (userId, orderId) => {
      const result = await options.pool.query<Record<string, unknown>>(
        `${orderSelect}
         where o.id = $1 and o.user_id = $2`,
        [orderId, userId],
      );
      const row = result.rows[0];
      if (!row) throw new CommercialRequestError(404, "The payment order was not found.");
      return mapOrder(row);
    },

    handleJazzCashCallback: async (fields) => {
      if (
        !options.config.FEATURE_JAZZCASH_ENABLED ||
        options.config.JAZZCASH_MODE === "disabled" ||
        !options.config.JAZZCASH_INTEGRITY_SALT
      ) {
        throw new CommercialRequestError(503, "JazzCash callbacks are disabled.");
      }
      if (!verifyJazzCashSecureHash(fields, options.config.JAZZCASH_INTEGRITY_SALT)) {
        throw new CommercialRequestError(400, "The JazzCash response signature is invalid.");
      }

      const reference = fields["pp_TxnRefNo"];
      const responseCode = fields["pp_ResponseCode"];
      const amount = Number(fields["pp_Amount"]);
      const currency = fields["pp_TxnCurrency"];
      if (
        !reference ||
        !responseCode ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        currency !== "PKR"
      ) {
        throw new CommercialRequestError(400, "The JazzCash response is incomplete.");
      }

      const digest = payloadDigest(fields);
      const providerEventId =
        fields["pp_RetreivalReferenceNo"] ||
        fields["pp_AuthCode"] ||
        `${reference}:${responseCode}:${digest.slice(0, 16)}`;
      const outcome = providerOutcome(responseCode);
      const connection = await options.pool.connect();

      try {
        await connection.query("begin");
        const selected = await connection.query<Record<string, unknown>>(
          `select
             o.id,
             p.code as plan_code,
             p.name as plan_name,
             o.status,
             o.amount_minor,
             o.currency,
             o.merchant_reference,
             o.provider_reference,
             o.checkout_expires_at,
             o.created_at,
             o.user_id,
             o.plan_version_id,
             v.billing_period
           from payment_orders o
           join commercial_plan_versions v on v.id = o.plan_version_id
           join commercial_plans p on p.id = v.plan_id
           where o.merchant_reference = $1
           for update`,
          [reference],
        );
        const row = selected.rows[0];
        if (!row) {
          throw new CommercialRequestError(404, "The JazzCash order reference is unknown.");
        }

        const event = await connection.query<{ id: string }>(
          `insert into payment_events (
             order_id,
             provider,
             provider_event_id,
             event_type,
             provider_status,
             signature_verified,
             payload_digest
           )
           values ($1, 'jazzcash', $2, 'checkout_return', $3, true, $4)
           on conflict (provider, provider_event_id) do nothing
           returning id`,
          [row["id"], providerEventId, responseCode, digest],
        );
        if (event.rowCount === 0) {
          await connection.query("commit");
          return mapOrder(row);
        }

        if (row["amount_minor"] !== amount || row["currency"] !== currency) {
          await connection.query(
            `insert into reconciliation_cases (
               order_id,
               mismatch_kind,
               provider_evidence,
               internal_evidence
             )
             values (
               $1,
               case when $2::integer <> $3::integer then 'amount' else 'currency' end,
               jsonb_build_object('amountMinor', $2::integer, 'currency', $4::text, 'responseCode', $5::text),
               jsonb_build_object('amountMinor', $3::integer, 'currency', $6::text)
             )
             on conflict do nothing`,
            [row["id"], amount, row["amount_minor"], currency, responseCode, row["currency"]],
          );
          await connection.query(
            `insert into commercial_events (user_id, event_name, plan_code, order_id, properties)
             values ($1, 'reconciliation_opened', $2, $3, '{"reason":"payment_mismatch"}'::jsonb)`,
            [row["user_id"], row["plan_code"], row["id"]],
          );
          await connection.query("commit");
          throw new CommercialRequestError(
            409,
            "The provider response does not match the payment order.",
          );
        }

        const currentStatus = row["status"] as PaymentStatus;
        const effectiveOutcome =
          currentStatus === "refunded"
            ? "refunded"
            : currentStatus === "succeeded" && outcome !== "refunded"
              ? "succeeded"
              : outcome;

        await connection.query(
          `update payment_orders
              set status = $2,
                  provider_reference = coalesce($3, provider_reference),
                  completed_at = case when $2 in ('succeeded', 'refunded') then coalesce(completed_at, $4) else completed_at end,
                  failure_code = case when $2 = 'failed' then $5 else null end,
                  failure_message = case when $2 = 'failed' then $6 else null end,
                  updated_at = $4
            where id = $1`,
          [
            row["id"],
            effectiveOutcome,
            fields["pp_RetreivalReferenceNo"] || null,
            now(),
            effectiveOutcome === "failed" ? responseCode : null,
            effectiveOutcome === "failed"
              ? fields["pp_ResponseMessage"]?.slice(0, 500) || "JazzCash payment failed."
              : null,
          ],
        );

        if (effectiveOutcome === "succeeded") {
          const insertedEntitlement = await connection.query<{ id: string }>(
            `insert into entitlements (
               user_id,
               plan_version_id,
               source_order_id,
               status,
               starts_at,
               ends_at,
               created_at,
               updated_at
             )
             values (
               $1,
               $2,
               $3,
               'active',
               $4,
               case when $5 = 'month' then $4 + interval '1 month' else $4 + interval '1 year' end,
               $4,
               $4
             )
             on conflict (source_order_id) do nothing
             returning id`,
            [row["user_id"], row["plan_version_id"], row["id"], now(), row["billing_period"]],
          );
          let entitlementId = insertedEntitlement.rows[0]?.id;
          if (!entitlementId) {
            const existing = await connection.query<{ id: string }>(
              "select id from entitlements where source_order_id = $1",
              [row["id"]],
            );
            entitlementId = existing.rows[0]?.id;
          }
          if (!entitlementId) throw new Error("The premium entitlement could not be resolved.");

          if (insertedEntitlement.rowCount === 1) {
            await connection.query(
              `insert into entitlement_events (
                 entitlement_id,
                 action,
                 actor_type,
                 reason,
                 previous_status,
                 next_status
               )
               values ($1, 'activate', 'system', 'Verified JazzCash payment', null, 'active')`,
              [entitlementId],
            );
            await connection.query(
              `insert into commercial_events (
                 user_id,
                 event_name,
                 plan_code,
                 order_id,
                 entitlement_id,
                 properties
               )
               values ($1, 'payment_succeeded', $2, $3, $4, '{"verified":true}'::jsonb),
                      ($1, 'entitlement_activated', $2, $3, $4, '{"verified":true}'::jsonb)`,
              [row["user_id"], row["plan_code"], row["id"], entitlementId],
            );
          }
        } else if (effectiveOutcome === "refunded") {
          const entitlement = await connection.query<{
            id: string;
            previous_status: string;
          }>(
            `with previous as (
               select id, status
                 from entitlements
                where source_order_id = $1 and status <> 'refunded'
                for update
             ),
             updated as (
               update entitlements e
                  set status = 'refunded', updated_at = $2
                 from previous p
                where e.id = p.id
                returning e.id, p.status as previous_status
             )
             select id, previous_status from updated`,
            [row["id"], now()],
          );
          const entitlementId = entitlement.rows[0]?.id;
          if (entitlementId) {
            await connection.query(
              `insert into entitlement_events (
                 entitlement_id,
                 action,
                 actor_type,
                 reason,
                 previous_status,
                 next_status
               )
               values ($1, 'refund', 'system', 'Verified JazzCash refund', $2, 'refunded')`,
              [entitlementId, entitlement.rows[0]?.previous_status],
            );
            await connection.query(
              `insert into commercial_events (
                 user_id,
                 event_name,
                 plan_code,
                 order_id,
                 entitlement_id,
                 properties
               )
               values ($1, 'entitlement_refunded', $2, $3, $4, '{"verified":true}'::jsonb)`,
              [row["user_id"], row["plan_code"], row["id"], entitlementId],
            );
          }
        } else {
          const eventName =
            effectiveOutcome === "pending"
              ? "payment_pending"
              : effectiveOutcome === "failed"
                ? "payment_failed"
                : null;
          if (eventName) {
            await connection.query(
              `insert into commercial_events (
                 user_id,
                 event_name,
                 plan_code,
                 order_id,
                 properties
               )
               values ($1, $2, $3, $4, jsonb_build_object('responseCode', $5::text))`,
              [row["user_id"], eventName, row["plan_code"], row["id"], responseCode],
            );
          }
        }

        const updated = await connection.query<Record<string, unknown>>(
          `${orderSelect}
           where o.id = $1`,
          [row["id"]],
        );
        await connection.query("commit");
        const updatedRow = updated.rows[0];
        if (!updatedRow) throw new Error("The updated payment order could not be loaded.");
        return mapOrder(updatedRow);
      } catch (error) {
        await connection.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    },

    recordOfferView: async ({ userId, planCode, surface }) => {
      await options.pool.query(
        `insert into commercial_events (user_id, event_name, plan_code, properties)
         values ($1, 'premium_offer_viewed', $2, jsonb_build_object('surface', $3::text))`,
        [userId, planCode ?? null, surface],
      );
    },
  };
}

function bodyAsStringRecord(body: unknown): Readonly<Record<string, string>> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CommercialRequestError(400, "The callback payload is invalid.");
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" && key.length <= 100 && value.length <= 2_000) {
      result[key] = value;
    }
  }
  return result;
}

export function registerCommercialRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    commercialService: CommercialService;
  }>,
): void {
  app.get("/v1/commercial/plans", async () => ({
    plans: await options.commercialService.listPlans(),
  }));

  app.get("/v1/commercial/account", async (request) => {
    const learner = await requireAuthenticatedLearner(
      request,
      options.config,
      options.authService,
    );
    return options.commercialService.getAccount(learner.id);
  });

  app.post("/v1/commercial/orders", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const learner = await requireAuthenticatedLearner(
      request,
      options.config,
      options.authService,
    );
    const body = CreateOrderSchema.parse(request.body);
    return reply.status(201).send(
      await options.commercialService.createOrder({
        userId: learner.id,
        planCode: body.planCode,
        idempotencyKey: body.idempotencyKey,
      }),
    );
  });

  app.get("/v1/commercial/orders/:orderId", async (request) => {
    const learner = await requireAuthenticatedLearner(
      request,
      options.config,
      options.authService,
    );
    const { orderId } = OrderParamsSchema.parse(request.params);
    return {
      order: await options.commercialService.getOrder(learner.id, orderId),
    };
  });

  app.post("/v1/commercial/events/offer", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const body = OfferEventSchema.parse(request.body);
    let userId: string | null = null;
    try {
      const learner = await requireAuthenticatedLearner(
        request,
        options.config,
        options.authService,
      );
      userId = learner.id;
    } catch {
      userId = null;
    }
    await options.commercialService.recordOfferView({
      userId,
      planCode: body.planCode,
      surface: body.surface,
    });
    return reply.status(204).send();
  });

  app.post("/v1/commercial/jazzcash/callback", async (request) => ({
    order: await options.commercialService.handleJazzCashCallback(
      bodyAsStringRecord(request.body),
    ),
  }));
}
