import { randomUUID } from "node:crypto";

import { createDatabaseClient } from "@skillup/database";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createCommercialService, jazzCashSecureHash } from "./commercial.js";
import { readApiConfig } from "./config.js";
import { createJazzCashV11BillingService } from "./jazzcash-v11-billing.js";
import {
  type JazzCashV11ChargeInput,
  type JazzCashV11Client,
  JazzCashV11Error,
} from "./jazzcash-v11.js";

const databaseUrl = process.env["DATABASE_URL"];
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const database = databaseUrl
  ? createDatabaseClient({
      connectionString: databaseUrl,
      applicationName: "skillup-launch-payment-acceptance",
      maxConnections: 4,
    })
  : null;

afterAll(async () => {
  await database?.close();
});

function acceptanceConfig() {
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  return readApiConfig({
    APP_ENV: "test",
    DEPLOYMENT_ENVIRONMENT: "test",
    PUBLIC_APP_URL: "https://skillup.example",
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: "launch-payment-acceptance-secret-at-least-32-bytes",
    FEATURE_PREMIUM_ENABLED: "true",
    PREMIUM_JAZZCASH_V11_CHECKOUT: "true",
    JAZZCASH_V11_URL: "https://sandbox.example/m-wallet",
    JAZZCASH_V11_INQUIRY_URL: "https://sandbox.example/status/inquiry",
    JAZZCASH_V11_MERCHANT_ID: "ACCEPTANCE-MERCHANT",
    JAZZCASH_V11_PASSWORD: "acceptance-password",
    JAZZCASH_V11_INTEGRITY_SALT: "acceptance-integrity-salt",
    JAZZCASH_V11_RETURN_URL: "https://skillup.example/en/account/payment-return",
    JAZZCASH_V11_TIMEOUT_MS: "30000",
    JAZZCASH_V11_CHECKOUT_MINUTES: "15",
  });
}

async function createLearner(): Promise<string> {
  if (!database) throw new Error("DATABASE_URL is required.");
  const user = await database.pool.query<{ id: string }>(
    "insert into users (status) values ('active') returning id",
  );
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error("Could not create acceptance learner.");
  return userId;
}

function successfulProviderResponse(
  input: JazzCashV11ChargeInput,
  reference = `RRN-${randomUUID()}`,
): Readonly<Record<string, string>> {
  return {
    pp_ResponseCode: "000",
    pp_ResponseMessage: "Thank you for using JazzCash.",
    pp_TxnRefNo: input.txnRefNo,
    pp_Amount: String(input.amountMinor),
    pp_TxnCurrency: "PKR",
    pp_RetreivalReferenceNo: reference,
  };
}

function signedCallback(
  fields: Readonly<Record<string, string>>,
  integritySalt: string,
): Readonly<Record<string, string>> {
  return {
    ...fields,
    pp_SecureHash: jazzCashSecureHash(fields, integritySalt),
  };
}

async function entitlementEvidence(orderId: string, userId: string) {
  if (!database) throw new Error("DATABASE_URL is required.");
  const result = await database.pool.query<{
    order_status: string;
    plan_code: string | null;
    entitlement_status: string | null;
    entitlement_count: number;
    active_capabilities: number;
  }>(
    `select
       (select status from payment_orders where id = $1) as order_status,
       (select p.code
          from entitlements e
          join commercial_plan_versions v on v.id = e.plan_version_id
          join commercial_plans p on p.id = v.plan_id
         where e.source_order_id = $1
         limit 1) as plan_code,
       (select status
          from entitlements
         where source_order_id = $1
         limit 1) as entitlement_status,
       (select count(*)::integer
          from entitlements
         where source_order_id = $1) as entitlement_count,
       (select count(*)::integer
          from active_user_capabilities
         where user_id = $2) as active_capabilities`,
    [orderId, userId],
  );
  return result.rows[0];
}

describeWithPostgres("launch payment acceptance gate", () => {
  it("monthly success grants exactly one active Premium entitlement", async () => {
    if (!database) throw new Error("DATABASE_URL is required.");
    const config = acceptanceConfig();
    const commercial = createCommercialService({ pool: database.pool, config });
    const charge = vi.fn(async (input: JazzCashV11ChargeInput) =>
      successfulProviderResponse(input),
    );
    const client: JazzCashV11Client = {
      charge,
      inquire: async () => {
        throw new Error("Inquiry is not used in monthly success.");
      },
    };
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config,
      commercialService: commercial,
      client,
    });
    const userId = await createLearner();

    const result = await billing.charge({
      userId,
      planCode: "premium-monthly",
      msisdn: "03123456789",
      mpin: "5555",
      cnic: "345678",
      idempotencyKey: `monthly-${randomUUID()}`,
    });

    expect(result.order.status).toBe("succeeded");
    expect(result.order.amountMinor).toBe(59_900);
    expect(charge).toHaveBeenCalledTimes(1);

    const evidence = await entitlementEvidence(result.order.id, userId);
    expect(evidence).toMatchObject({
      order_status: "succeeded",
      plan_code: "premium-monthly",
      entitlement_status: "active",
      entitlement_count: 1,
    });
    expect(evidence?.active_capabilities).toBeGreaterThan(0);
  });

  it("yearly success grants exactly one active yearly Premium entitlement", async () => {
    if (!database) throw new Error("DATABASE_URL is required.");
    const config = acceptanceConfig();
    const commercial = createCommercialService({ pool: database.pool, config });
    const client: JazzCashV11Client = {
      charge: async (input) => successfulProviderResponse(input),
      inquire: async () => {
        throw new Error("Inquiry is not used in yearly success.");
      },
    };
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config,
      commercialService: commercial,
      client,
    });
    const userId = await createLearner();

    const result = await billing.charge({
      userId,
      planCode: "premium-yearly",
      msisdn: "03123456789",
      mpin: "5555",
      cnic: "345678",
      idempotencyKey: `yearly-${randomUUID()}`,
    });

    expect(result.order.status).toBe("succeeded");
    expect(result.order.amountMinor).toBe(499_900);

    const evidence = await entitlementEvidence(result.order.id, userId);
    expect(evidence).toMatchObject({
      order_status: "succeeded",
      plan_code: "premium-yearly",
      entitlement_status: "active",
      entitlement_count: 1,
    });
    expect(evidence?.active_capabilities).toBeGreaterThan(0);
  });

  it("failed provider payment grants no Premium entitlement", async () => {
    if (!database) throw new Error("DATABASE_URL is required.");
    const config = acceptanceConfig();
    const commercial = createCommercialService({ pool: database.pool, config });
    const client: JazzCashV11Client = {
      charge: async (input) => ({
        pp_ResponseCode: "101",
        pp_ResponseMessage: "Payment failed",
        pp_TxnRefNo: input.txnRefNo,
      }),
      inquire: async () => {
        throw new Error("Inquiry is not used in failed payment.");
      },
    };
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config,
      commercialService: commercial,
      client,
    });
    const userId = await createLearner();

    const result = await billing.charge({
      userId,
      planCode: "premium-monthly",
      msisdn: "03123456789",
      mpin: "5555",
      cnic: "345678",
      idempotencyKey: `failed-${randomUUID()}`,
    });

    expect(result.order.status).toBe("failed");
    const evidence = await entitlementEvidence(result.order.id, userId);
    expect(evidence).toMatchObject({
      order_status: "failed",
      plan_code: null,
      entitlement_status: null,
      entitlement_count: 0,
      active_capabilities: 0,
    });
  });

  it("duplicate/retry does not double-charge or duplicate entitlement", async () => {
    if (!database) throw new Error("DATABASE_URL is required.");
    const config = acceptanceConfig();
    const commercial = createCommercialService({ pool: database.pool, config });
    const charge = vi.fn(async (input: JazzCashV11ChargeInput) =>
      successfulProviderResponse(input, "RRN-IDEMPOTENT"),
    );
    const client: JazzCashV11Client = {
      charge,
      inquire: async () => {
        throw new Error("Inquiry is not used in duplicate acceptance.");
      },
    };
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config,
      commercialService: commercial,
      client,
    });
    const userId = await createLearner();
    const idempotencyKey = `duplicate-${randomUUID()}`;

    const first = await billing.charge({
      userId,
      planCode: "premium-monthly",
      msisdn: "03123456789",
      mpin: "5555",
      cnic: "345678",
      idempotencyKey,
    });
    const second = await billing.charge({
      userId,
      planCode: "premium-monthly",
      msisdn: "03123456789",
      mpin: "5555",
      cnic: "345678",
      idempotencyKey,
    });

    expect(second.order.id).toBe(first.order.id);
    expect(second.order.status).toBe("succeeded");
    expect(charge).toHaveBeenCalledTimes(1);

    const evidence = await database.pool.query<{
      orders: number;
      entitlements: number;
      provider_events: number;
    }>(
      `select
         (select count(*)::integer
            from payment_orders
           where user_id = $1 and idempotency_key = $2) as orders,
         (select count(*)::integer
            from entitlements
           where source_order_id = $3) as entitlements,
         (select count(*)::integer
            from payment_events
           where order_id = $3 and provider = 'jazzcash') as provider_events`,
      [userId, idempotencyKey, first.order.id],
    );
    expect(evidence.rows[0]).toMatchObject({
      orders: 1,
      entitlements: 1,
      provider_events: 1,
    });
  });

  it("status inquiry reconciles an ambiguous pending charge to the correct final state", async () => {
    if (!database) throw new Error("DATABASE_URL is required.");
    const config = acceptanceConfig();
    const commercial = createCommercialService({ pool: database.pool, config });
    const userId = await createLearner();
    const idempotencyKey = `inquiry-${randomUUID()}`;

    const ambiguousClient: JazzCashV11Client = {
      charge: async () => {
        throw new JazzCashV11Error("Provider connection dropped after submission.");
      },
      inquire: async () => {
        throw new Error("Inquiry is not used on the ambiguous client.");
      },
    };
    const ambiguousBilling = createJazzCashV11BillingService({
      pool: database.pool,
      config,
      commercialService: commercial,
      client: ambiguousClient,
    });

    await expect(
      ambiguousBilling.charge({
        userId,
        planCode: "premium-monthly",
        msisdn: "03123456789",
        mpin: "5555",
        cnic: "345678",
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ statusCode: 502 });

    const pending = await database.pool.query<{
      id: string;
      merchant_reference: string;
      status: string;
    }>(
      `select id, merchant_reference, status
         from payment_orders
        where user_id = $1 and idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    const order = pending.rows[0];
    expect(order?.status).toBe("pending");
    if (!order) throw new Error("Pending order was not preserved for reconciliation.");

    const inquire = vi.fn(async () => ({
      status: "SUCCESS",
      rrn: "RRN-INQUIRY-RECOVERY",
      authCode: "AUTH-RECOVERY",
    }));
    const recoveryClient: JazzCashV11Client = {
      charge: async () => {
        throw new Error("Charge must not be retried during status reconciliation.");
      },
      inquire,
    };
    const recoveryBilling = createJazzCashV11BillingService({
      pool: database.pool,
      config,
      commercialService: commercial,
      client: recoveryClient,
    });

    const reconciled = await recoveryBilling.inquire({
      userId,
      txnRefNo: order.merchant_reference,
    });

    expect(inquire).toHaveBeenCalledTimes(1);
    expect(reconciled.order.id).toBe(order.id);
    expect(reconciled.order.status).toBe("succeeded");
    expect(reconciled.providerResponseCode).toBe("SUCCESS");

    const evidence = await entitlementEvidence(order.id, userId);
    expect(evidence).toMatchObject({
      order_status: "succeeded",
      plan_code: "premium-monthly",
      entitlement_status: "active",
      entitlement_count: 1,
    });
  });

  it("verified refund corrects entitlement and removes active Premium capabilities", async () => {
    if (!database) throw new Error("DATABASE_URL is required.");
    const config = acceptanceConfig();
    const commercial = createCommercialService({ pool: database.pool, config });
    const client: JazzCashV11Client = {
      charge: async (input) => successfulProviderResponse(input, "RRN-REFUND-SOURCE"),
      inquire: async () => {
        throw new Error("Inquiry is not used in refund acceptance.");
      },
    };
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config,
      commercialService: commercial,
      client,
    });
    const userId = await createLearner();

    const paid = await billing.charge({
      userId,
      planCode: "premium-monthly",
      msisdn: "03123456789",
      mpin: "5555",
      cnic: "345678",
      idempotencyKey: `refund-${randomUUID()}`,
    });
    expect(paid.order.status).toBe("succeeded");

    const integritySalt = config.JAZZCASH_V11_INTEGRITY_SALT;
    if (!integritySalt) throw new Error("Acceptance integrity salt is required.");
    const refunded = await commercial.handleJazzCashCallback(
      signedCallback(
        {
          pp_TxnRefNo: paid.order.merchantReference,
          pp_Amount: String(paid.order.amountMinor),
          pp_TxnCurrency: "PKR",
          pp_ResponseCode: "131",
          pp_RetreivalReferenceNo: "RRN-REFUND-FINAL",
        },
        integritySalt,
      ),
    );
    expect(refunded.status).toBe("refunded");

    const evidence = await entitlementEvidence(paid.order.id, userId);
    expect(evidence).toMatchObject({
      order_status: "refunded",
      plan_code: "premium-monthly",
      entitlement_status: "refunded",
      entitlement_count: 1,
      active_capabilities: 0,
    });

    const refundEvents = await database.pool.query<{ count: number }>(
      `select count(*)::integer as count
         from entitlement_events ee
         join entitlements e on e.id = ee.entitlement_id
        where e.source_order_id = $1
          and ee.action = 'refund'`,
      [paid.order.id],
    );
    expect(refundEvents.rows[0]?.count).toBe(1);
  });
});
