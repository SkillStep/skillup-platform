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

export const ExternalPaymentPlanSchema = z
  .object({
    code: z.string().min(1).max(64),
    interval: z.enum(["weekly", "monthly", "yearly"]),
    fullAmountMinor: z.number().int().positive(),
    stepAmountMinor: z.number().int().positive(),
    trialHours: z.number().int().min(0).max(720).optional(),
    currency: z.string().length(3).default("PKR"),
  })
  .passthrough();

export const ExternalWalletLinkSchema = z
  .object({
    requestId: z.string().min(1).max(256),
    returnUrl: z.string().url(),
    portalUrl: z.string().url(),
    method: z.literal("POST"),
    fields: z.record(z.string(), z.string()),
  })
  .passthrough();

export const ExternalWalletSchema = z
  .object({
    id: z.string().optional(),
    status: WalletStatusSchema,
    msisdn_masked: z.string().nullable().optional(),
    consented_at: z.string().datetime().nullable().optional(),
    unlinked_at: z.string().datetime().nullable().optional(),
    created_at: z.string().datetime().nullable().optional(),
  })
  .passthrough();

export const ExternalSubscriptionSchema = z
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

export const ExternalPaymentStatusSchema = z
  .object({
    wallet: ExternalWalletSchema,
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
    subscriptions: z.array(ExternalSubscriptionSchema).default([]),
  })
  .passthrough();

export const ExternalPaymentRecordSchema = z
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

export type ExternalPaymentPlan = z.infer<typeof ExternalPaymentPlanSchema>;
export type ExternalWalletLink = z.infer<typeof ExternalWalletLinkSchema>;
export type ExternalWallet = z.infer<typeof ExternalWalletSchema>;
export type ExternalSubscription = z.infer<typeof ExternalSubscriptionSchema>;
export type ExternalPaymentStatus = z.infer<typeof ExternalPaymentStatusSchema>;
export type ExternalPaymentRecord = z.infer<typeof ExternalPaymentRecordSchema>;

export class ExternalPaymentRequestError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;

  constructor(statusCode: number, errorCode: string, message: string) {
    super(message);
    this.name = "ExternalPaymentRequestError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export type ExternalPaymentClient = Readonly<{
  listPlans: () => Promise<readonly ExternalPaymentPlan[]>;
  upsertPlans: (plans: readonly ExternalPaymentPlan[]) => Promise<unknown>;
  linkWallet: (
    input: Readonly<{
      userId: string;
      msisdn: string;
      planCode: string;
      appReturnUrl: string;
    }>,
  ) => Promise<ExternalWalletLink>;
  getWallet: (userId: string) => Promise<ExternalWallet>;
  unlinkWallet: (userId: string) => Promise<Readonly<{ status: "unlinked" }>>;
  getStatus: (userId: string) => Promise<ExternalPaymentStatus>;
  createSubscription: (
    input: Readonly<{
      userId: string;
      planCode: string;
      skipTrial?: boolean;
    }>,
  ) => Promise<ExternalSubscription>;
  cancelSubscription: (subscriptionId: string) => Promise<unknown>;
  listPayments: (userId: string) => Promise<readonly ExternalPaymentRecord[]>;
  getPayment: (paymentId: string) => Promise<ExternalPaymentRecord>;
}>;

function requireConfig(config: ApiConfig): Readonly<{
  baseUrl: string;
  apiKey: string;
  timeoutSeconds: number;
}> {
  if (
    !config.FEATURE_PAYMENT_SERVICE_ENABLED ||
    !config.PAYMENT_SERVICE_BASE_URL ||
    !config.PAYMENT_SERVICE_API_KEY
  ) {
    throw new ExternalPaymentRequestError(
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

async function jsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ExternalPaymentRequestError(
      502,
      "invalid_upstream_response",
      "The payment service returned invalid JSON.",
    );
  }
}

function parseUpstream<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ExternalPaymentRequestError(
      502,
      "invalid_upstream_response",
      "The payment service returned an invalid response.",
    );
  }
  return parsed.data;
}

export function createExternalPaymentClient(
  config: ApiConfig,
  fetcher: FetchLike = fetch,
): ExternalPaymentClient {
  const provider = requireConfig(config);

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
          "x-api-key": provider.apiKey,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        redirect: "error",
        signal: AbortSignal.timeout(provider.timeoutSeconds * 1_000),
      });
    } catch {
      throw new ExternalPaymentRequestError(
        502,
        "payment_service_unreachable",
        "The payment service could not be reached.",
      );
    }

    const payload = await jsonPayload(response);
    if (!response.ok) {
      const parsed = PaymentServiceErrorSchema.safeParse(payload);
      if (response.status === 401) {
        throw new ExternalPaymentRequestError(
          502,
          "payment_service_unauthorized",
          "SkillUp could not authenticate to the payment service.",
        );
      }
      if (parsed.success) {
        throw new ExternalPaymentRequestError(
          response.status,
          parsed.data.error,
          parsed.data.message,
        );
      }
      throw new ExternalPaymentRequestError(
        response.status >= 400 && response.status < 600 ? response.status : 502,
        "payment_service_error",
        "The payment service rejected the request.",
      );
    }
    return payload;
  }

  return {
    listPlans: async () =>
      parseUpstream(z.array(ExternalPaymentPlanSchema), await request("/v1/plans")),

    upsertPlans: (plans) =>
      request("/v1/plans", {
        method: "PUT",
        body: plans.length === 1 ? plans[0] : plans,
      }),

    linkWallet: async (input) =>
      parseUpstream(
        ExternalWalletLinkSchema,
        await request("/v1/wallets/link", { method: "POST", body: input }),
      ),

    getWallet: async (userId) =>
      parseUpstream(
        ExternalWalletSchema,
        await request(`/v1/wallets/${encodeURIComponent(userId)}`),
      ),

    unlinkWallet: async (userId) =>
      parseUpstream(
        z.object({ status: z.literal("unlinked") }),
        await request("/v1/wallets/unlink", { method: "POST", body: { userId } }),
      ),

    getStatus: async (userId) =>
      parseUpstream(
        ExternalPaymentStatusSchema,
        await request(`/v1/users/${encodeURIComponent(userId)}/status`),
      ),

    createSubscription: async (input) =>
      parseUpstream(
        ExternalSubscriptionSchema,
        await request("/v1/subscriptions", { method: "POST", body: input }),
      ),

    cancelSubscription: (subscriptionId) =>
      request(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
        method: "POST",
      }),

    listPayments: async (userId) =>
      parseUpstream(
        z.array(ExternalPaymentRecordSchema),
        await request(`/v1/users/${encodeURIComponent(userId)}/payments`),
      ),

    getPayment: async (paymentId) =>
      parseUpstream(
        ExternalPaymentRecordSchema,
        await request(`/v1/payments/${encodeURIComponent(paymentId)}`),
      ),
  };
}
