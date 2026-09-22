import { createHash, randomBytes } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "./auth.js";
import { jazzCashSecureHash, type CommercialService } from "./commercial.js";
import { type ApiConfig, isJazzCashV11CheckoutEnabled } from "./config.js";
import {
  createJazzCashV11Client,
  JazzCashV11Error,
  type JazzCashV11Client,
  type JazzCashV11Fields,
  redactJazzCashV11Fields,
} from "./jazzcash-v11.js";
import { requireAuthenticatedLearner, requireTrustedRequestOrigin } from "./request-auth.js";

const PlanCodeSchema = z.enum(["premium-monthly", "premium-yearly"]);

const ChargeBodySchema = z
  .object({
    planId: z.string().trim().min(1).max(80).optional(),
    planCode: PlanCodeSchema.optional(),
    msisdn: z
      .string()
      .trim()
      .regex(/^\d{11,15}$/, "Enter a JazzCash mobile number using 11–15 digits."),
    mpin: z
      .string()
      .trim()
      .regex(/^\d{4}$/, "Enter the 4-digit JazzCash MPIN."),
    cnic: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the last 6 digits of the CNIC."),
    idempotencyKey: z.string().trim().min(12).max(128).optional(),
  })
  .strict()
  .superRefine((body, context) => {
    if (!body.planCode && !body.planId) {
      context.addIssue({
        code: "custom",
        path: ["planCode"],
        message: "planCode or planId is required.",
      });
    }
  });

const InquiryBodySchema = z
  .object({
    txnRefNo: z
      .string()
      .trim()
      .regex(/^Goo[0-9]{14}[A-Z0-9]{0,2}$/, "txnRefNo must be a JazzCash v11 merchant reference."),
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

class JazzCashV11BillingError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "JazzCashV11BillingError";
    this.statusCode = statusCode;
  }
}

function resolvePlanCode(body: z.infer<typeof ChargeBodySchema>): "premium-monthly" | "premium-yearly" {
  if (body.planCode) return body.planCode;
  const planId = body.planId?.trim().toLowerCase() ?? "";
  if (planId === "premium-monthly" || planId === "monthly") return "premium-monthly";
  if (planId === "premium-yearly" || planId === "yearly") return "premium-yearly";
  throw new JazzCashV11BillingError(400, "The selected premium plan is unavailable.");
}

function pakistanStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

function gooTxnRef(now: Date): string {
  // JazzCash v11: Goo{yyyyMMddHHmmss} with optional 2-char uniqueness suffix (max 20).
  return `Goo${pakistanStamp(now)}${randomBytes(1).toString("hex").toUpperCase()}`;
}

function signedSettlementFields(
  input: Readonly<{
    integritySalt: string;
    txnRefNo: string;
    amountMinor: number;
    responseCode: string;
    providerReference: string;
  }>,
): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {
    pp_TxnRefNo: input.txnRefNo,
    pp_Amount: String(input.amountMinor),
    pp_TxnCurrency: "PKR",
    pp_ResponseCode: input.responseCode,
    pp_RetreivalReferenceNo: input.providerReference,
  };
  fields["pp_SecureHash"] = jazzCashSecureHash(fields, input.integritySalt);
  return fields;
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

function payloadDigest(fields: Readonly<Record<string, string>>): string {
  const normalized = Object.fromEntries(
    Object.entries(redactJazzCashV11Fields(fields)).sort(([left], [right]) =>
      left < right ? -1 : 1,
    ),
  );
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export type JazzCashV11BillingService = Readonly<{
  charge: (input: {
    userId: string;
    planCode: "premium-monthly" | "premium-yearly";
    msisdn: string;
    mpin: string;
    cnic: string;
    idempotencyKey: string;
  }) => Promise<
    Readonly<{
      order: PaymentOrder;
      checkoutMode: "jazzcash_v11";
      providerResponseCode: string | null;
      providerResponseMessage: string | null;
    }>
  >;
  inquire: (input: {
    userId: string;
    txnRefNo: string;
  }) => Promise<
    Readonly<{
      order: PaymentOrder;
      checkoutMode: "jazzcash_v11";
      providerResponseCode: string | null;
      providerResponseMessage: string | null;
    }>
  >;
}>;

export function createJazzCashV11BillingService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    config: ApiConfig;
    commercialService: CommercialService;
    client?: JazzCashV11Client;
    now?: () => Date;
  }>,
): JazzCashV11BillingService {
  const now = options.now ?? (() => new Date());
  const client = options.client ?? createJazzCashV11Client(options.config);

  async function requireEnabled(): Promise<void> {
    if (!isJazzCashV11CheckoutEnabled(options.config)) {
      throw new JazzCashV11BillingError(503, "JazzCash v11 checkout is not enabled.");
    }
  }

  return {
    charge: async ({ userId, planCode, msisdn, mpin, cnic, idempotencyKey }) => {
      await requireEnabled();
      const createdAt = now();
      const checkoutMinutes = options.config.JAZZCASH_V11_CHECKOUT_MINUTES ?? 15;
      const checkoutExpiresAt = new Date(createdAt.getTime() + checkoutMinutes * 60_000);
      const stamp = pakistanStamp(createdAt);
      const expiryStamp = pakistanStamp(checkoutExpiresAt);

      const connection = await options.pool.connect();
      let orderRow: Record<string, unknown>;
      let inserted = false;
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
          throw new JazzCashV11BillingError(404, "The selected premium plan is unavailable.");
        }

        let merchantReference = gooTxnRef(createdAt);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const insert = await connection.query<Record<string, unknown>>(
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
              merchantReference,
              checkoutExpiresAt,
              createdAt,
            ],
          );
          if ((insert.rowCount ?? 0) === 1) {
            inserted = true;
            break;
          }
          const existing = await connection.query<Record<string, unknown>>(
            `${orderSelect}
             where o.user_id = $1 and o.idempotency_key = $2
             for update`,
            [userId, idempotencyKey],
          );
          if (existing.rows[0]) {
            orderRow = existing.rows[0];
            await connection.query("commit");
            if (orderRow["status"] === "succeeded") {
              return {
                order: mapOrder(orderRow),
                checkoutMode: "jazzcash_v11",
                providerResponseCode: "000",
                providerResponseMessage: "Already settled.",
              };
            }
            if (orderRow["status"] !== "pending" && orderRow["status"] !== "created") {
              return {
                order: mapOrder(orderRow),
                checkoutMode: "jazzcash_v11",
                providerResponseCode: null,
                providerResponseMessage: "This checkout request already reached a final state.",
              };
            }
            // Idempotent replay of a pending charge: do not re-hit JazzCash with a new MPIN attempt
            // unless this request created the order.
            return {
              order: mapOrder(orderRow),
              checkoutMode: "jazzcash_v11",
              providerResponseCode: null,
              providerResponseMessage: "Checkout already started for this idempotency key.",
            };
          }
          // Unique merchant_reference collision — retry with a fresh Goo ref.
          merchantReference = gooTxnRef(new Date(createdAt.getTime() + attempt + 1));
        }
        if (!inserted) {
          throw new JazzCashV11BillingError(409, "Could not allocate a unique JazzCash txn reference.");
        }

        const selectedOrder = await connection.query<Record<string, unknown>>(
          `${orderSelect}
           where o.user_id = $1 and o.idempotency_key = $2
           for update`,
          [userId, idempotencyKey],
        );
        const row = selectedOrder.rows[0];
        if (!row) throw new Error("The payment order could not be loaded.");
        await connection.query(
          `insert into commercial_events (user_id, event_name, plan_code, order_id, properties)
           values ($1, 'checkout_started', $2, $3, '{"provider":"jazzcash","checkoutMode":"jazzcash_v11"}'::jsonb)`,
          [userId, planCode, row["id"]],
        );
        await connection.query("commit");
        orderRow = row;
      } catch (error) {
        await connection.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }

      const amountMinor = Number(orderRow["amount_minor"]);
      const txnRefNo = String(orderRow["merchant_reference"]);
      let providerFields: JazzCashV11Fields;
      try {
        providerFields = await client.charge({
          amountMinor,
          billReference: `B${stamp}`,
          description: "SkillUp premium membership",
          txnRefNo,
          txnDateTime: stamp,
          txnExpiryDateTime: expiryStamp,
          msisdn,
          mpin,
          cnic,
        });
      } catch (error) {
        if (error instanceof JazzCashV11Error) {
          throw new JazzCashV11BillingError(
            502,
            "JazzCash did not accept the payment request. No Premium entitlement was granted.",
          );
        }
        throw error;
      }

      const responseCode = providerFields["pp_ResponseCode"]?.trim() ?? null;
      const responseMessage = providerFields["pp_ResponseMessage"]?.trim() ?? null;
      const integritySalt = options.config.JAZZCASH_V11_INTEGRITY_SALT;
      if (!integritySalt) {
        throw new JazzCashV11BillingError(503, "JazzCash v11 is not fully configured.");
      }

      if (responseCode === "000") {
        const providerReference =
          providerFields["pp_RetreivalReferenceNo"] ||
          providerFields["pp_AuthCode"] ||
          `v11-${txnRefNo}`;
        const settled = await options.commercialService.handleJazzCashCallback(
          signedSettlementFields({
            integritySalt,
            txnRefNo,
            amountMinor,
            responseCode: "000",
            providerReference,
          }),
        );
        return {
          order: settled,
          checkoutMode: "jazzcash_v11",
          providerResponseCode: responseCode,
          providerResponseMessage: responseMessage,
        };
      }

      // Unsigned / failed orchestrator bodies: record failure without treating them as payment proof.
      const digest = payloadDigest(providerFields);
      const providerEventId =
        providerFields["pp_RetreivalReferenceNo"] ||
        providerFields["pp_AuthCode"] ||
        `v11:${txnRefNo}:${responseCode ?? "unknown"}:${digest.slice(0, 16)}`;
      const failConnection = await options.pool.connect();
      try {
        await failConnection.query("begin");
        await failConnection.query(
          `insert into payment_events (
             order_id,
             provider,
             provider_event_id,
             event_type,
             provider_status,
             signature_verified,
             payload_digest
           )
           values ($1, 'jazzcash', $2, 'checkout_return', $3, false, $4)
           on conflict (provider, provider_event_id) do nothing`,
          [orderRow["id"], providerEventId, responseCode ?? "unknown", digest],
        );
        await failConnection.query(
          `update payment_orders
              set status = 'failed',
                  updated_at = now()
            where id = $1
              and status in ('created', 'pending')`,
          [orderRow["id"]],
        );
        const updated = await failConnection.query<Record<string, unknown>>(
          `${orderSelect}
           where o.id = $1`,
          [orderRow["id"]],
        );
        await failConnection.query("commit");
        const updatedRow = updated.rows[0];
        if (!updatedRow) throw new Error("The updated payment order could not be loaded.");
        return {
          order: mapOrder(updatedRow),
          checkoutMode: "jazzcash_v11",
          providerResponseCode: responseCode,
          providerResponseMessage: responseMessage,
        };
      } catch (error) {
        await failConnection.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        failConnection.release();
      }
    },

    inquire: async ({ userId, txnRefNo }) => {
      await requireEnabled();
      const existing = await options.pool.query<Record<string, unknown>>(
        `${orderSelect}
         where o.user_id = $1 and o.merchant_reference = $2`,
        [userId, txnRefNo],
      );
      const row = existing.rows[0];
      if (!row) {
        throw new JazzCashV11BillingError(404, "The payment order was not found.");
      }

      let providerFields: JazzCashV11Fields;
      try {
        providerFields = await client.inquire({ txnRefNo });
      } catch {
        throw new JazzCashV11BillingError(502, "JazzCash status inquiry failed.");
      }

      const responseCode = providerFields["pp_ResponseCode"]?.trim() ?? null;
      const responseMessage = providerFields["pp_ResponseMessage"]?.trim() ?? null;
      const integritySalt = options.config.JAZZCASH_V11_INTEGRITY_SALT;
      if (responseCode === "000" && integritySalt) {
        const providerReference =
          providerFields["pp_RetreivalReferenceNo"] ||
          providerFields["pp_AuthCode"] ||
          `v11-inq-${txnRefNo}`;
        const settled = await options.commercialService.handleJazzCashCallback(
          signedSettlementFields({
            integritySalt,
            txnRefNo,
            amountMinor: Number(row["amount_minor"]),
            responseCode: "000",
            providerReference,
          }),
        );
        return {
          order: settled,
          checkoutMode: "jazzcash_v11",
          providerResponseCode: responseCode,
          providerResponseMessage: responseMessage,
        };
      }

      return {
        order: mapOrder(row),
        checkoutMode: "jazzcash_v11",
        providerResponseCode: responseCode,
        providerResponseMessage: responseMessage,
      };
    },
  };
}

export function registerJazzCashV11BillingRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    billingService: JazzCashV11BillingService;
  }>,
): void {
  app.post("/v1/premium/billing/jazzcash-v11/charge", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const body = ChargeBodySchema.parse(request.body);
    const planCode = resolvePlanCode(body);
    const idempotencyKey =
      body.idempotencyKey ??
      `v11-${planCode}-${learner.id.slice(0, 8)}-${pakistanStamp(new Date())}-${randomBytes(4).toString("hex")}`;

    request.log.info(
      {
        checkoutMode: "jazzcash_v11",
        planCode,
        msisdnSuffix: body.msisdn.slice(-4),
      },
      "JazzCash v11 charge requested",
    );

    try {
      const result = await options.billingService.charge({
        userId: learner.id,
        planCode,
        msisdn: body.msisdn,
        mpin: body.mpin,
        cnic: body.cnic,
        idempotencyKey,
      });
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof JazzCashV11BillingError) {
        throw error;
      }
      throw error;
    }
  });

  app.post("/v1/premium/billing/jazzcash-v11/inquiry", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const body = InquiryBodySchema.parse(request.body);
    return options.billingService.inquire({
      userId: learner.id,
      txnRefNo: body.txnRefNo,
    });
  });

  app.get("/v1/premium/billing/jazzcash-v11/status", async () => ({
    checkoutMode: isJazzCashV11CheckoutEnabled(options.config) ? "jazzcash_v11" : null,
    enabled: isJazzCashV11CheckoutEnabled(options.config),
  }));
}
