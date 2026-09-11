import { createHmac, randomUUID } from "node:crypto";

import { createDatabaseClient } from "@skillup/database";
import { afterAll, describe, expect, it } from "vitest";

import { readApiConfig } from "./config.js";
import { createExternalBillingService } from "./external-billing.js";
import type {
  ExternalPaymentClient,
  ExternalPaymentPlan,
  ExternalPaymentStatus,
} from "./external-payment-client.js";

const databaseUrl = process.env["DATABASE_URL"];
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const database = databaseUrl
  ? createDatabaseClient({
      connectionString: databaseUrl,
      applicationName: "skillup-external-billing-test",
      maxConnections: 4,
    })
  : null;

const webhookSecret = "external-payment-webhook-test-secret";
const fixedNow = new Date("2026-09-07T10:00:00.000Z");
const periodEnd = "2026-10-07T10:00:00.000Z";

const plans: readonly ExternalPaymentPlan[] = [
  {
    code: "monthly",
    interval: "monthly",
    fullAmountMinor: 59_900,
    stepAmountMinor: 59_900,
    trialHours: 0,
    currency: "PKR",
  },
  {
    code: "yearly",
    interval: "yearly",
    fullAmountMinor: 499_900,
    stepAmountMinor: 499_900,
    trialHours: 0,
    currency: "PKR",
  },
];

function statusFor(
  subscriptionStatus: "active" | "past_due" | "canceled" | "expired" | "payment_failed",
  lastPaymentStatus: "completed" | "failed" | "refunded" = "completed",
): ExternalPaymentStatus {
  const hasPaidPeriod = ["active", "past_due", "canceled"].includes(subscriptionStatus);
  return {
    wallet: {
      status: subscriptionStatus === "expired" ? "unlinked" : "linked",
      msisdn_masked: "0300***4567",
    },
    alreadySubscribed: ["active", "past_due"].includes(subscriptionStatus),
    status: {
      wallet_linked: subscriptionStatus !== "expired",
      subscription_status: subscriptionStatus,
      current_period_paid: hasPaidPeriod,
      next_due_at: subscriptionStatus === "active" ? periodEnd : null,
      last_payment_status: lastPaymentStatus,
      last_success_at: "2026-09-07T09:59:00.000Z",
    },
    subscriptions: [
      {
        id: "subscription-test-1",
        plan_code: "monthly",
        amount_minor: 59_900,
        step_amount_minor: 59_900,
        charge_tier: "full",
        currency: "PKR",
        interval: "monthly",
        status: subscriptionStatus,
        next_due_at: subscriptionStatus === "active" ? periodEnd : null,
        current_period_end: hasPaidPeriod ? periodEnd : "2026-09-01T10:00:00.000Z",
        trial_ends_at: null,
      },
    ],
  };
}

function signedEvent(
  userId: string,
  eventId: string,
  type:
    | "subscription.activated"
    | "subscription.canceled"
    | "subscription.expired"
    | "payment.refunded",
  createdAt: string,
): Readonly<{ rawBody: Buffer; signature: string; eventHeader: string }> {
  const rawBody = Buffer.from(
    JSON.stringify({ eventId, type, userId, createdAt, data: {} }),
    "utf8",
  );
  return {
    rawBody,
    signature: createHmac("sha256", webhookSecret).update(rawBody).digest("hex"),
    eventHeader: type,
  };
}

function fakeClient(readStatus: () => ExternalPaymentStatus): ExternalPaymentClient {
  return {
    listPlans: async () => plans,
    upsertPlans: async () => ({}),
    linkWallet: async () => {
      throw new Error("not used");
    },
    getWallet: async () => ({ status: "linked" }),
    unlinkWallet: async () => ({ status: "unlinked" }),
    getStatus: async () => readStatus(),
    createSubscription: async () => {
      throw new Error("not used");
    },
    cancelSubscription: async () => ({}),
    listPayments: async () => [],
    getPayment: async () => {
      throw new Error("not used");
    },
  };
}

afterAll(async () => {
  await database?.close();
});

describeWithPostgres("external payment-service webhook entitlement lifecycle", () => {
  it("verifies signature, dedupes, ignores stale events, keeps canceled paid access, and revokes on refund", async () => {
    if (!database || !databaseUrl) {
      throw new Error("DATABASE_URL is required for the external billing test.");
    }

    const config = readApiConfig({
      APP_ENV: "test",
      PUBLIC_APP_URL: "https://skillup.example",
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "external-billing-test-secret-at-least-32-bytes",
      FEATURE_PREMIUM_ENABLED: "true",
      FEATURE_PAYMENT_SERVICE_ENABLED: "true",
      PAYMENT_SERVICE_BASE_URL: "https://payments.example",
      PAYMENT_SERVICE_API_KEY: "external-billing-api-key",
      PAYMENT_SERVICE_WEBHOOK_SECRET: webhookSecret,
    });

    const user = await database.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id",
    );
    const userId = user.rows[0]?.id;
    expect(userId).toBeTruthy();
    if (!userId) return;

    let authoritativeStatus = statusFor("active");
    const service = createExternalBillingService({
      pool: database.pool,
      config,
      client: fakeClient(() => authoritativeStatus),
      now: () => fixedNow,
    });

    const invalid = signedEvent(
      userId,
      `invalid-${randomUUID()}`,
      "subscription.activated",
      "2026-09-07T10:01:00.000Z",
    );
    await expect(
      service.handleWebhook({ ...invalid, signature: "0".repeat(64) }),
    ).rejects.toMatchObject({ statusCode: 401, errorCode: "invalid_payment_signature" });

    const wrongHeader = signedEvent(
      userId,
      `header-${randomUUID()}`,
      "subscription.activated",
      "2026-09-07T10:02:00.000Z",
    );
    await expect(
      service.handleWebhook({ ...wrongHeader, eventHeader: "payment.failed" }),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "payment_event_mismatch" });

    const activated = signedEvent(
      userId,
      `active-${randomUUID()}`,
      "subscription.activated",
      "2026-09-07T10:03:00.000Z",
    );
    expect(await service.handleWebhook(activated)).toEqual({ duplicate: false, stale: false });
    expect(await service.handleWebhook(activated)).toEqual({ duplicate: true, stale: false });

    let entitlement = await database.pool.query<{ status: string; ends_at: Date }>(
      `select e.status, e.ends_at
         from payment_service_subscription_state s
         join entitlements e on e.id = s.entitlement_id
        where s.user_id = $1`,
      [userId],
    );
    expect(entitlement.rows[0]?.status).toBe("active");
    expect(entitlement.rows[0]?.ends_at.toISOString()).toBe(periodEnd);

    authoritativeStatus = statusFor("canceled");
    const canceled = signedEvent(
      userId,
      `cancel-${randomUUID()}`,
      "subscription.canceled",
      "2026-09-07T10:10:00.000Z",
    );
    expect(await service.handleWebhook(canceled)).toEqual({ duplicate: false, stale: false });
    entitlement = await database.pool.query<{ status: string; ends_at: Date }>(
      `select e.status, e.ends_at
         from payment_service_subscription_state s
         join entitlements e on e.id = s.entitlement_id
        where s.user_id = $1`,
      [userId],
    );
    expect(entitlement.rows[0]?.status).toBe("active");
    expect(entitlement.rows[0]?.ends_at.toISOString()).toBe(periodEnd);

    authoritativeStatus = statusFor("expired", "failed");
    const stale = signedEvent(
      userId,
      `stale-${randomUUID()}`,
      "subscription.expired",
      "2026-09-07T10:05:00.000Z",
    );
    expect(await service.handleWebhook(stale)).toEqual({ duplicate: false, stale: true });
    const staleEntitlement = await database.pool.query<{ status: string }>(
      `select e.status
         from payment_service_subscription_state s
         join entitlements e on e.id = s.entitlement_id
        where s.user_id = $1`,
      [userId],
    );
    expect(staleEntitlement.rows[0]?.status).toBe("active");

    authoritativeStatus = statusFor("canceled", "refunded");
    const refunded = signedEvent(
      userId,
      `refund-${randomUUID()}`,
      "payment.refunded",
      "2026-09-07T10:20:00.000Z",
    );
    expect(await service.handleWebhook(refunded)).toEqual({ duplicate: false, stale: false });

    const finalState = await database.pool.query<{
      entitlement_status: string;
      refund_events: number;
      stale_events: number;
      processed_events: number;
    }>(
      `select
         (select e.status
            from payment_service_subscription_state s
            join entitlements e on e.id = s.entitlement_id
           where s.user_id = $1) as entitlement_status,
         (select count(*)::integer
            from entitlement_events ee
            join payment_service_subscription_state s on s.entitlement_id = ee.entitlement_id
           where s.user_id = $1 and ee.action = 'refund') as refund_events,
         (select count(*)::integer
            from payment_service_webhook_events
           where user_id = $1 and processing_status = 'ignored_stale') as stale_events,
         (select count(*)::integer
            from payment_service_webhook_events
           where user_id = $1 and processing_status = 'processed') as processed_events`,
      [userId],
    );
    expect(finalState.rows[0]).toMatchObject({
      entitlement_status: "refunded",
      refund_events: 1,
      stale_events: 1,
      processed_events: 3,
    });
  });
});
