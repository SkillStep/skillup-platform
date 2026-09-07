import { z } from "zod";

import type { ApiConfig } from "./config.js";

type FetchLike = typeof fetch;

const PaymentServiceErrorSchema = z
  .object({
    error: z.string().min(1).max(120),
    message: z.string().min(1).max(1_000),
  })
  .passthrough();

const WalletStatusSchema = z.enum(["none", "pending", "linked", "unlinked", "failed"]);
const SubscriptionStatusSchema = z.enum([
  "initiated",
  "trialing",
  "active",
  "past_due",
  "paused",
  "payment_failed",
  "expired",
  "canceled",
]);
const PaymentStatusSchema = z.enum(["pending", "completed", "failed", "expired", "refunded"]);

export const PaymentServicePlanSchema = z
  .object({
    code: z.string().min(1).max(64),
    interval: z.enum(["weekly", "monthly", "yearly"]),
    fullAmountMinor: z.number().int().positive(),
    stepAmountMinor: z.number().int().positive(),
    trialHours: z.number().int().min(0).max(720).optional(),
    currency: z.string().length(3).default("PKR"),
  })
  .passthrough();

export const PaymentServiceWalletLinkSchema = z
  .object({
    requestId: z.string().min(1).max(256),
    returnUrl: z.string().url(),
    portalUrl: z.string().url(),
    method: z.literal("POST"),
    fields: z.record(z.string(), z.string()),
  })
  .passthrough();

export const PaymentServiceWalletSchema = z
  .object({
    id: z.string().optional(),
    status: WalletStatusSchema,
    msisdn_masked: z.string().nullable().optional(),
    consented_at: z.string().datetime().nullable().optional(),
    unlinked_at: z.string().datetime().nullable().optional(),
    created_at: z.string().datetime().nullable().optional(),
  })
  .passthrough();

export const PaymentServiceSubscriptionSchema = z
  .object({
    id: z.string().min(1).max(256),
    plan_code: z.string().min(1).max(64),
    amount_minor: z.number().int().positive(),
    step_amount_minor: z.number().int().positive().optional(),
    charge_tier: z.enum(["full", "step"]).nullable().optional(),
    currency: z.literal("PKR"),
    interval: z.enum(["weekly", "monthly", "yearly"]),
    status: SubscriptionStatusSchema,
    next_due_at: z.string().datetime().nullable().optional(),
    current_period_end: z.string().datetime().nullable().optional(),
    trial_ends_at: z.string().datetime().nullable().optional(),
    canceled_at: z.string().datetime().nullable().optional(),
  })
  .passthrough();

export const PaymentServiceStatusSchema = z
  .object({
    wallet: PaymentServiceWalletSchema,
    alreadySubscribed: z.boolean().default(false),
    status: z
      .object({
        wallet_linked: z.boolean(),
        subscription_status: SubscriptionStatusSchema.nullable(),
        current_period_paid: z.boolean(),
        next_due_at: z.string().datetime().nullable().optional(),
        last_payment_status: PaymentStatusSchema.nullable().optional(),
        last_success_at: z.string().datetime().nullable().optional(),
      })
      .passthrough(),
    subscriptions: z.array(PaymentServiceSubscriptionSchema).default([]),
  })
  .passthrough();

export const PaymentServicePaymentSchema = z
  .object({
    id: z.string().min(1).max(256),
    amount_minor: z.number().int().positive(),
    charge_kind: z.enum(["full", "step"]).optional(),
    currency: z.literal("PKR"),
    status: PaymentStatusSchema,
    txn_ref_no: z.string().nullable().optional(),
    response_code: z.string().nullable().optional(),
    response_message: z.string().nullable().optional(),
    jazzcash_rrn: z.string().nullable().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime().optional(),
  })
  .passthrough();

export type PaymentServicePlan = z.infer<typeof PaymentServicePlanSchema>;
export type PaymentServiceWalletLink = z.infer<typeof PaymentServiceWalletLinkSchema>;
export type PaymentServiceWallet = z.infer<typeof PaymentServiceWalletSchema>;
export type PaymentServiceSubscription = z.infer<typeof PaymentServiceSubscriptionSchema>;
export type PaymentServiceStatus = z.infer<typeof PaymentServiceStatusSchema>;
export type PaymentServicePayment = z.infer<typeof PaymentServicePaymentSchema>;

export class PaymentServiceRequestError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;

  constructor(statusCode: number, errorCode: string, message: string) {
    super(message);
    this.name = "PaymentServiceRequestError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export type PaymentServiceClient = Readonly<{
  listPlans: () => Promise<readonly PaymentServicePlan[]>;
  upsertPlans: (plans: readonly PaymentServicePlan[]) => Promise<unknown>;
  linkWallet: (input: Readonly<{
    userId: string;
    msisdn: string;
    planCode: string;
    appReturnUrl: string;
  }>) => Promise<PaymentServiceWalletLink>;
  getWallet: (userId: string) => Promise<PaymentServiceWallet>;
  unlinkWallet: (userId: string) => Promise<Readonly<{ status: "unlinked" }>>;
  getStatus: (userId: string) => Promise<PaymentServiceStatus>;
  createSubscription: (input: Readonly<{
    userId: string;
    planCode: string;
    skipTrial?: boolean;
  }>) => Promise<PaymentServiceSubscription>;
  cancelSubscription: (subscriptionId: string) => Promise<unknown>;
  listPayments: (userId: string) => Promise<readonly PaymentServicePayment[]>;
  getPayment: (paymentId: string) => Promise<PaymentServicePayment>;
}>;

function requirePaymentServiceConfig(config: ApiConfig): Readonly<{
  baseUrl: string;
  apiKey: string;
  timeoutSeconds: number;
}> {
  if (
    !config.FEATURE_PAYMENT_SERVICE_ENABLED ||
    !config.PAYMENT_SERVICE_BASE_URL ||
    !config.PAYMENT_SERVICE_API_KEY
  ) {
    throw new PaymentServiceRequestError(
      503,
      "payment_service_disabled",
      "The payment service is not configured.",
    );
  }
  return {
    baseUrl: config.PAYMENT_SERVICE_BASE_URL,
    apiKey: config.PAYMENT_SERVICE_API_KEY,
    timeoutSeconds: config.PAYMENT_SERVICE_TIMEOUT_SECONDS ?? 15,
  };
}

function endpoint(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), base).toString();
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PaymentServiceRequestError(
      502,
      "invalid_upstream_response",
      "The payment service returned invalid JSON.",
    );
  }
}

export function createPaymentServiceClient(
  config: ApiConfig,
  fetcher: FetchLike = fetch,
): PaymentServiceClient {
  const provider = requirePaymentServiceConfig(config);

  async function request(
    path: string,
    init: Readonly<{ method?: string; body?: unknown }> = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(endpoint(provider.baseUrl, path), {
        method: init.method ?? "GET",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": provider.apiKey,
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        redirect: "error",
        signal: AbortSignal.timeout(provider.timeoutSeconds * 1_000),
      });
    } catch {
      throw new PaymentServiceRequestError(
        502,
        "payment_service_unreachable",
        "The payment service could not be reached.",
      );
    }

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const parsed = PaymentServiceErrorSchema.safeParse(payload);
      if (parsed.success) {
        throw new PaymentServiceRequestError(response.status, parsed.data.error, parsed.data.message);
      }
      throw new PaymentServiceRequestError(
        response.status >= 400 && response.status < 600 ? response.status : 502,
        "payment_service_error",
        "The payment service rejected the request.",
      );
    }
    return payload;
  }

  return {
    listPlans: async () => {
      const payload = await request("/v1/plans");
      return z.array(PaymentServicePlanSchema).parse(payload);
    },

    upsertPlans: async (plans) =>
      request("/v1/plans", {
        method: "PUT",
        body: plans.length === 1 ? plans[0] : plans,
      }),

    linkWallet: async (input) =>
      PaymentServiceWalletLinkSchema.parse(
        await request("/v1/wallets/link", {
          method: "POST",
          body: input,
        }),
      ),

    getWallet: async (userId) =>
      PaymentServiceWalletSchema.parse(
        await request(`/v1/wallets/${encodeURIComponent(userId)}`),
      ),

    unlinkWallet: async (userId) =>
      z
        .object({ status: z.literal("unlinked") })
        .parse(
          await request("/v1/wallets/unlink", {
            method: "POST",
            body: { userId },
          }),
        ),

    getStatus: async (userId) =>
      PaymentServiceStatusSchema.parse(
        await request(`/v1/users/${encodeURIComponent(userId)}/status`),
      ),

    createSubscription: async (input) =>
      PaymentServiceSubscriptionSchema.parse(
        await request("/v1/subscriptions", {
          method: "POST",
          body: input,
        }),
      ),

    cancelSubscription: async (subscriptionId) =>
      request(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
        method: "POST",
      }),

    listPayments: async (userId) =>
      z
        .array(PaymentServicePaymentSchema)
        .parse(await request(`/v1/users/${encodeURIComponent(userId)}/payments`)),

    getPayment: async (paymentId) =>
      PaymentServicePaymentSchema.parse(
        await request(`/v1/payments/${encodeURIComponent(paymentId)}`),
      ),
  };
}
