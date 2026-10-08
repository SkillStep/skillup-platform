import { createHash, randomBytes } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AuthRequestError, type AuthService } from "./auth.js";
import { type CommercialService, jazzCashSecureHash } from "./commercial.js";
import { type ApiConfig, isJazzCashV11CheckoutEnabled } from "./config.js";
import {
  createJazzCashV11Client,
  type JazzCashV11Client,
  JazzCashV11Error,
  type JazzCashV11Fields,
  verifyJazzCashV11SecureHash,
} from "./jazzcash-v11.js";
import {
  optionalAuthenticatedLearner,
  RequestAuthorizationError,
  requireAuthenticatedLearner,
  requireTrustedRequestOrigin,
} from "./request-auth.js";

const PlanCodeSchema = z.enum(["premium-monthly", "premium-yearly"]);

const StartLinkBodySchema = z
  .object({
    planCode: PlanCodeSchema,
    msisdn: z
      .string()
      .trim()
      .regex(/^\d{11,15}$/, "Enter a JazzCash mobile number using 11–15 digits."),
    consentToAutoPay: z.literal(true),
    idempotencyKey: z.string().trim().min(12).max(128).optional(),
  })
  .strict();

const LinkCallbackBodySchema = z
  .object({
    fields: z.record(z.string(), z.string()),
  })
  .strict();

const InquiryBodySchema = z
  .object({
    txnRefNo: z
      .string()
      .trim()
      .regex(/^Goo[0-9]{14}[A-Z0-9]{0,3}$/, "txnRefNo must be a JazzCash merchant reference."),
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
  // JazzCash orchestrator expects pp_TxnRefNo ≤ 20 chars: Goo + yyyyMMddHHmmss (14) + suffix.
  // Use 3 hex chars (~4096/sec) so parallel CI charges in the same second rarely collide.
  return `Goo${pakistanStamp(now)}${randomBytes(2).toString("hex").toUpperCase().slice(0, 3)}`;
}

function isMerchantReferenceConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as Readonly<{ code?: unknown }>).code === "23505" &&
    "constraint" in error &&
    (error as Readonly<{ constraint?: unknown }>).constraint ===
      "payment_orders_merchant_reference_key"
  );
}

function linkRequestId(): string {
  return `ReqId${Date.now()}${randomBytes(2).toString("hex")}`;
}

function payloadDigest(fields: Readonly<Record<string, string>>): string {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
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

export type JazzCashV11BillingService = Readonly<{
  startWalletLink: (input: {
    userId: string;
    planCode: "premium-monthly" | "premium-yearly";
    msisdn: string;
    idempotencyKey: string;
  }) => Promise<
    Readonly<{
      checkoutMode: "jazzcash_wallet_link";
      requestId: string;
      actionUrl: string;
      fields: Readonly<Record<string, string>>;
    }>
  >;
  completeWalletLink: (input: {
    userId?: string;
    fields: Readonly<Record<string, string>>;
  }) => Promise<
    Readonly<{
      order: PaymentOrder;
      checkoutMode: "jazzcash_wallet_link";
      providerResponseCode: string | null;
      providerResponseMessage: string | null;
    }>
  >;
  inquire: (input: { userId: string; txnRefNo: string }) => Promise<
    Readonly<{
      order: PaymentOrder;
      checkoutMode: "jazzcash_wallet_link";
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
  const client = options.client ?? createJazzCashV11Client(options.config);
  const now = options.now ?? (() => new Date());

  async function requireEnabled(): Promise<void> {
    if (!isJazzCashV11CheckoutEnabled(options.config)) {
      throw new JazzCashV11BillingError(503, "JazzCash wallet-link checkout is not enabled.");
    }
  }

  async function chargeTokenForPlan(input: {
    userId: string;
    planCode: "premium-monthly" | "premium-yearly";
    paymentToken: string;
    msisdn: string;
    idempotencyKey: string;
  }) {
    const createdAt = now();
    const checkoutMinutes = options.config.JAZZCASH_V11_CHECKOUT_MINUTES ?? 15;
    const checkoutExpiresAt = new Date(createdAt.getTime() + checkoutMinutes * 60_000);
    const txnExpiryDateTime = pakistanStamp(new Date(createdAt.getTime() + 24 * 60 * 60_000));
    const stamp = pakistanStamp(createdAt);

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
        [input.planCode],
      );
      const selected = plan.rows[0];
      if (!selected) {
        throw new JazzCashV11BillingError(404, "The selected premium plan is unavailable.");
      }

      let merchantReference = gooTxnRef(createdAt);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          const insert = await connection.query(
            `insert into payment_orders (
             user_id, plan_version_id, provider, status, amount_minor, currency,
             idempotency_key, merchant_reference, checkout_expires_at, created_at, updated_at
           )
           values ($1, $2, 'jazzcash', 'pending', $3, $4, $5, $6, $7, $8, $8)
           on conflict (user_id, idempotency_key) do nothing
           returning id`,
            [
              input.userId,
              selected.plan_version_id,
              selected.amount_minor,
              selected.currency,
              input.idempotencyKey,
              merchantReference,
              checkoutExpiresAt,
              createdAt,
            ],
          );
          if ((insert.rowCount ?? 0) === 1) {
            inserted = true;
            break;
          }
        } catch (error) {
          if (!isMerchantReferenceConflict(error) || attempt === 7) throw error;
          merchantReference = gooTxnRef(new Date(createdAt.getTime() + attempt + 1));
          continue;
        }
        const existing = await connection.query<Record<string, unknown>>(
          `${orderSelect}
           where o.user_id = $1 and o.idempotency_key = $2
           for update`,
          [input.userId, input.idempotencyKey],
        );
        if (existing.rows[0]) {
          orderRow = existing.rows[0];
          await connection.query("commit");
          if (orderRow["status"] === "succeeded") {
            return {
              order: mapOrder(orderRow),
              checkoutMode: "jazzcash_wallet_link" as const,
              providerResponseCode: "000",
              providerResponseMessage: "Already settled.",
            };
          }
          return {
            order: mapOrder(orderRow),
            checkoutMode: "jazzcash_wallet_link" as const,
            providerResponseCode: null,
            providerResponseMessage: "Checkout already started for this idempotency key.",
          };
        }
        merchantReference = gooTxnRef(new Date(createdAt.getTime() + attempt + 1));
      }
      if (!inserted) {
        throw new JazzCashV11BillingError(
          409,
          "Could not allocate a unique JazzCash txn reference.",
        );
      }

      const selectedOrder = await connection.query<Record<string, unknown>>(
        `${orderSelect}
         where o.user_id = $1 and o.idempotency_key = $2
         for update`,
        [input.userId, input.idempotencyKey],
      );
      const row = selectedOrder.rows[0];
      if (!row) throw new Error("The payment order could not be loaded.");
      await connection.query(
        `insert into commercial_events (user_id, event_name, plan_code, order_id, properties)
         values ($1, 'checkout_started', $2, $3, '{"provider":"jazzcash","checkoutMode":"jazzcash_wallet_link"}'::jsonb)`,
        [input.userId, input.planCode, row["id"]],
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
      providerFields = await client.chargeWithToken({
        amountMinor,
        billReference: `B${stamp}`,
        description: "SkillUp premium membership",
        paymentToken: input.paymentToken,
        txnRefNo,
        txnDateTime: stamp,
        txnExpiryDateTime,
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
      throw new JazzCashV11BillingError(503, "JazzCash wallet-link is not fully configured.");
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
        checkoutMode: "jazzcash_wallet_link" as const,
        providerResponseCode: responseCode,
        providerResponseMessage: responseMessage,
      };
    }

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
           order_id, provider, provider_event_id, event_type, provider_status, signature_verified, payload_digest
         )
         values ($1, 'jazzcash', $2, 'checkout_return', $3, false, $4)
         on conflict (provider, provider_event_id) do nothing`,
        [orderRow["id"], providerEventId, responseCode ?? "unknown", digest],
      );
      await failConnection.query(
        `update payment_orders
            set status = 'failed', updated_at = now()
          where id = $1 and status in ('created', 'pending')`,
        [orderRow["id"]],
      );
      const updated = await failConnection.query<Record<string, unknown>>(
        `${orderSelect} where o.id = $1`,
        [orderRow["id"]],
      );
      await failConnection.query("commit");
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw new Error("The updated payment order could not be loaded.");
      return {
        order: mapOrder(updatedRow),
        checkoutMode: "jazzcash_wallet_link" as const,
        providerResponseCode: responseCode,
        providerResponseMessage: responseMessage,
      };
    } catch (error) {
      await failConnection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      failConnection.release();
    }
  }

  return {
    startWalletLink: async ({ userId, planCode, msisdn, idempotencyKey }) => {
      await requireEnabled();
      const createdAt = now();
      const expiresAt = new Date(
        createdAt.getTime() + (options.config.JAZZCASH_V11_CHECKOUT_MINUTES ?? 15) * 60_000,
      );

      const connection = await options.pool.connect();
      try {
        await connection.query("begin");
        const existing = await connection.query<{
          request_id: string;
          status: string;
          msisdn: string;
        }>(
          `select request_id, status, msisdn
             from jazzcash_wallet_link_intents
            where user_id = $1 and idempotency_key = $2
            for update`,
          [userId, idempotencyKey],
        );
        let requestId = existing.rows[0]?.request_id;
        if (!requestId) {
          requestId = linkRequestId();
          await connection.query(
            `insert into jazzcash_wallet_link_intents
               (user_id, plan_code, msisdn, request_id, idempotency_key, status, expires_at, created_at, updated_at)
             values ($1, $2, $3, $4, $5, 'pending', $6, $7, $7)`,
            [userId, planCode, msisdn, requestId, idempotencyKey, expiresAt, createdAt],
          );
        } else if (existing.rows[0]?.status !== "pending") {
          throw new JazzCashV11BillingError(409, "This wallet-link request already completed.");
        }
        await connection.query("commit");
        const form = client.buildWalletLinkForm({ msisdn, requestId });
        return {
          checkoutMode: "jazzcash_wallet_link" as const,
          requestId,
          actionUrl: form.actionUrl,
          fields: form.fields,
        };
      } catch (error) {
        await connection.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    },

    completeWalletLink: async ({ userId, fields }) => {
      await requireEnabled();
      const integritySalt = options.config.JAZZCASH_V11_INTEGRITY_SALT;
      if (!integritySalt) {
        throw new JazzCashV11BillingError(503, "JazzCash wallet-link is not fully configured.");
      }
      if (!verifyJazzCashV11SecureHash(fields, integritySalt)) {
        throw new JazzCashV11BillingError(
          400,
          "The JazzCash wallet-link response signature is invalid.",
        );
      }

      const requestId = fields["pp_RequestID"]?.trim();
      const responseCode = fields["pp_ResponseCode"]?.trim() ?? "";
      const paymentToken = fields["pp_PaymentToken"]?.trim();
      const msisdn =
        fields["pp_MSISDN"]?.trim() ||
        fields["pp_MobileNumber"]?.trim() ||
        fields["ppmpf_1"]?.trim() ||
        "";

      if (!requestId) {
        throw new JazzCashV11BillingError(400, "The JazzCash wallet-link response is incomplete.");
      }

      // Resolve the learner from the signed request id. JazzCash returns via cross-site POST,
      // so the browser session cookie is often missing on the first callback hit.
      const intent = await options.pool.query<{
        user_id: string;
        plan_code: "premium-monthly" | "premium-yearly";
        msisdn: string;
        status: string;
        idempotency_key: string;
      }>(
        `select user_id, plan_code, msisdn, status, idempotency_key
           from jazzcash_wallet_link_intents
          where request_id = $1`,
        [requestId],
      );
      const selectedIntent = intent.rows[0];
      if (!selectedIntent) {
        throw new JazzCashV11BillingError(404, "The wallet-link request was not found.");
      }
      if (userId && userId !== selectedIntent.user_id) {
        throw new JazzCashV11BillingError(
          403,
          "This JazzCash wallet-link belongs to a different SkillUp account.",
        );
      }
      const ownerId = selectedIntent.user_id;
      if (selectedIntent.status === "completed") {
        throw new JazzCashV11BillingError(409, "This wallet-link request already completed.");
      }
      if (responseCode !== "000" || !paymentToken) {
        await options.pool.query(
          `update jazzcash_wallet_link_intents
              set status = 'failed', updated_at = now()
            where request_id = $1`,
          [requestId],
        );
        throw new JazzCashV11BillingError(
          402,
          fields["pp_ResponseMessage"]?.trim() ||
            "JazzCash wallet linking failed. No Premium entitlement was granted.",
        );
      }

      const resolvedMsisdn = msisdn || selectedIntent.msisdn;
      await options.pool.query(
        `update jazzcash_wallet_links
            set status = 'revoked', revoked_at = now(), updated_at = now()
          where user_id = $1 and status = 'active'`,
        [ownerId],
      );
      await options.pool.query(
        `insert into jazzcash_wallet_links
           (user_id, msisdn, payment_token, request_id, status, plan_code, linked_at, created_at, updated_at)
         values ($1, $2, $3, $4, 'active', $5, now(), now(), now())
         on conflict (request_id) do update
           set payment_token = excluded.payment_token,
               status = 'active',
               revoked_at = null,
               updated_at = now()`,
        [ownerId, resolvedMsisdn, paymentToken, requestId, selectedIntent.plan_code],
      );
      await options.pool.query(
        `update jazzcash_wallet_link_intents
            set status = 'completed', updated_at = now()
          where request_id = $1`,
        [requestId],
      );

      return chargeTokenForPlan({
        userId: ownerId,
        planCode: selectedIntent.plan_code,
        paymentToken,
        msisdn: resolvedMsisdn,
        idempotencyKey: `link-charge-${selectedIntent.idempotency_key}`,
      });
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
        providerFields = await client.inquirePaymentStatus({ txnRefNo });
      } catch {
        throw new JazzCashV11BillingError(502, "JazzCash status inquiry failed.");
      }

      const rawStatus =
        providerFields["pp_ResponseCode"]?.trim() ||
        providerFields["responseCode"]?.trim() ||
        providerFields["status"]?.trim() ||
        null;
      const responseMessage =
        providerFields["pp_ResponseMessage"]?.trim() ||
        providerFields["responseMessage"]?.trim() ||
        null;
      const normalizedStatus = rawStatus?.toUpperCase() ?? null;
      const inquirySucceeded = normalizedStatus === "000" || normalizedStatus === "SUCCESS";
      const integritySalt = options.config.JAZZCASH_V11_INTEGRITY_SALT;
      if (inquirySucceeded && integritySalt && row["status"] !== "succeeded") {
        const providerReference =
          providerFields["pp_RetreivalReferenceNo"] ||
          providerFields["rrn"] ||
          providerFields["pp_AuthCode"] ||
          providerFields["authCode"] ||
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
          checkoutMode: "jazzcash_wallet_link",
          providerResponseCode: rawStatus,
          providerResponseMessage: responseMessage,
        };
      }

      return {
        order: mapOrder(row),
        checkoutMode: "jazzcash_wallet_link",
        providerResponseCode: rawStatus,
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
  app.post("/v1/premium/billing/jazzcash-v11/link/start", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const body = StartLinkBodySchema.parse(request.body);

    // Pay-first user flow: session optional. Signed-in learners keep their account;
    // guests get (or reuse) a phone-bound learner for the JazzCash MSISDN with no session.
    const sessionLearner = await optionalAuthenticatedLearner(
      request,
      options.config,
      options.authService,
    );
    let userId: string;
    if (sessionLearner) {
      userId = sessionLearner.id;
    } else {
      try {
        const checkoutLearner = await options.authService.resolveOrCreatePhoneLearnerForCheckout(
          body.msisdn,
        );
        userId = checkoutLearner.userId;
      } catch (error) {
        if (error instanceof AuthRequestError) {
          throw new JazzCashV11BillingError(error.statusCode, error.message);
        }
        throw error;
      }
    }

    const idempotencyKey =
      body.idempotencyKey ??
      `link-${body.planCode}-${userId.slice(0, 8)}-${pakistanStamp(new Date())}-${randomBytes(4).toString("hex")}`;

    request.log.info(
      {
        checkoutMode: "jazzcash_wallet_link",
        planCode: body.planCode,
        msisdnSuffix: body.msisdn.slice(-4),
        authenticated: Boolean(sessionLearner),
      },
      "JazzCash wallet-link start requested",
    );

    const result = await options.billingService.startWalletLink({
      userId,
      planCode: body.planCode,
      msisdn: body.msisdn,
      idempotencyKey,
    });
    return reply.status(201).send(result);
  });

  app.post("/v1/premium/billing/jazzcash-v11/link/complete", async (request, reply) => {
    // Return URL may be a JazzCash-registered host (e.g. skillupshop.codistan.org) that differs from PUBLIC_APP_URL.
    const origin = request.headers.origin;
    const publicOrigin = new URL(options.config.PUBLIC_APP_URL).origin;
    const returnOrigin = options.config.JAZZCASH_V11_RETURN_URL
      ? new URL(options.config.JAZZCASH_V11_RETURN_URL).origin
      : null;
    if (origin !== publicOrigin && origin !== returnOrigin) {
      requireTrustedRequestOrigin(request, options.config);
    }

    // Session is optional: JazzCash posts cross-site and often omits the SkillUp cookie.
    // Ownership is proven by the signed pp_RequestID → wallet-link intent mapping.
    let userId: string | undefined;
    try {
      const learner = await requireAuthenticatedLearner(
        request,
        options.config,
        options.authService,
      );
      userId = learner.id;
    } catch (error) {
      if (!(error instanceof RequestAuthorizationError) || error.statusCode !== 401) {
        throw error;
      }
    }

    const body = LinkCallbackBodySchema.parse(request.body);
    const result = await options.billingService.completeWalletLink({
      ...(userId ? { userId } : {}),
      fields: body.fields,
    });
    return reply.status(201).send(result);
  });

  app.post("/v1/premium/billing/jazzcash-v11/charge", async () => {
    throw new JazzCashV11BillingError(
      410,
      "Direct MPIN charge is retired. Use JazzCash wallet-link checkout.",
    );
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
    checkoutMode: isJazzCashV11CheckoutEnabled(options.config) ? "jazzcash_wallet_link" : null,
    enabled: isJazzCashV11CheckoutEnabled(options.config),
  }));
}

export { JazzCashV11BillingError };
