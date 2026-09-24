import { randomUUID } from "node:crypto";

import { createDatabaseClient } from "@skillup/database";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createCommercialAutomationService } from "./commercial-automation.js";
import { createCommercialService } from "./commercial.js";
import { readApiConfig } from "./config.js";
import {
  createJazzCashV11BillingService,
} from "./jazzcash-v11-billing.js";
import {
  JazzCashV11Error,
  type JazzCashV11Client,
} from "./jazzcash-v11.js";
import type { JazzCashCpsClient } from "./jazzcash-cps.js";

const databaseUrl = process.env["DATABASE_URL"];
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const database = databaseUrl
  ? createDatabaseClient({
      connectionString: databaseUrl,
      applicationName: "skillup-payment-launch-acceptance",
      maxConnections: 4,
    })
  : null;

const createdUsers: string[] = [];

afterAll(async () => {
  if (database && createdUsers.length > 0) {
    await database.pool.query("delete from users where id = any($1::uuid[])", [createdUsers]);
  }
  await database?.close();
});

function config() {
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  return readApiConfig({
    APP_ENV: "test",
    DEPLOYMENT_ENVIRONMENT: "test",
    PUBLIC_APP_URL: "https://skillup.example",
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: "payment-acceptance-secret-at-least-32-bytes",
    FEATURE_PREMIUM_ENABLED: "true",
    FEATURE_PAYMENT_SERVICE_ENABLED: "false",
    FEATURE_JAZZCASH_ENABLED: "false",
    JAZZCASH_MODE: "disabled",
    PREMIUM_JAZZCASH_V11_CHECKOUT: "true",
    JAZZCASH_V11_URL: "https://sandbox.example/m-wallet",
    JAZZCASH_V11_INQUIRY_URL: "https://sandbox.example/inquiry",
    JAZZCASH_V11_MERCHANT_ID: "TEST-MERCHANT",
    JAZZCASH_V11_PASSWORD: "test-password",
    JAZZCASH_V11_INTEGRITY_SALT: "test-integrity-salt",
    JAZZCASH_V11_RETURN_URL: "https://skillup.example/en/account/payment-return",
  });
}

async function createUser(): Promise<string> {
  if (!database) throw new Error("Database unavailable.");
  const result = await database.pool.query<{ id: string }>(
    "insert into users (status) values ('active') returning id",
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Could not create acceptance learner.");
  createdUsers.push(id);
  return id;
}

function successClient(reference = "RRN-ACCEPT"): JazzCashV11Client {
  return {
    charge: vi.fn(async (input) => ({
      pp_ResponseCode: "000",
      pp_ResponseMessage: "Accepted",
      pp_TxnRefNo: input.txnRefNo,
      pp_Amount: String(input.amountMinor),
      pp_TxnCurrency: "PKR",
      pp_RetreivalReferenceNo: reference,
    })),
    inquire: vi.fn(async ({ txnRefNo }) => ({
      status: "SUCCESS",
      rrn: `INQ-${txnRefNo.slice(-8)}`,
      authCode: "AUTH-ACCEPT",
    })),
  };
}

async function entitlementEvidence(orderId: string) {
  if (!database) throw new Error("Database unavailable.");
  const result = await database.pool.query<{
    order_status: string;
    plan_code: string;
    amount_minor: number;
    entitlement_status: string | null;
    starts_at: Date | null;
    ends_at: Date | null;
    entitlement_count: number;
  }>(
    `select
       o.status as order_status,
       p.code as plan_code,
       o.amount_minor,
       e.status as entitlement_status,
       e.starts_at,
       e.ends_at,
       (select count(*)::integer from entitlements e2 where e2.source_order_id = o.id) as entitlement_count
     from payment_orders o
     join commercial_plan_versions v on v.id = o.plan_version_id
     join commercial_plans p on p.id = v.plan_id
     left join entitlements e on e.source_order_id = o.id
     where o.id = $1`,
    [orderId],
  );
  return result.rows[0];
}

describeWithPostgres("JazzCash V11 essential launch acceptance", () => {
  it("monthly success activates exactly one monthly Premium entitlement", async () => {
    if (!database) throw new Error("Database unavailable.");
    const cfg = config();
    const commercial = createCommercialService({ pool: database.pool, config: cfg });
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config: cfg,
      commercialService: commercial,
      client: successClient("RRN-MONTHLY"),
    });
    const userId = await createUser();

    const result = await billing.charge({
      userId,
      planCode: "premium-monthly",
      msisdn: "03000000001",
      mpin: "1111",
      cnic: "111111",
      idempotencyKey: `monthly-${randomUUID()}`,
    });

    expect(result.providerResponseCode).toBe("000");
    expect(result.order.status).toBe("succeeded");
    const row = await entitlementEvidence(result.order.id);
    expect(row).toMatchObject({
      order_status: "succeeded",
      plan_code: "premium-monthly",
      amount_minor: 59_900,
      entitlement_status: "active",
      entitlement_count: 1,
    });
    const days =
      ((row?.ends_at?.getTime() ?? 0) - (row?.starts_at?.getTime() ?? 0)) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(27);
    expect(days).toBeLessThanOrEqual(32);
  });

  it("yearly success activates exactly one yearly Premium entitlement", async () => {
    if (!database) throw new Error("Database unavailable.");
    const cfg = config();
    const commercial = createCommercialService({ pool: database.pool, config: cfg });
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config: cfg,
      commercialService: commercial,
      client: successClient("RRN-YEARLY"),
    });
    const userId = await createUser();

    const result = await billing.charge({
      userId,
      planCode: "premium-yearly",
      msisdn: "03000000002",
      mpin: "1111",
      cnic: "111111",
      idempotencyKey: `yearly-${randomUUID()}`,
    });

    expect(result.order.status).toBe("succeeded");
    const row = await entitlementEvidence(result.order.id);
    expect(row).toMatchObject({
      plan_code: "premium-yearly",
      amount_minor: 499_900,
      entitlement_status: "active",
      entitlement_count: 1,
    });
    const days =
      ((row?.ends_at?.getTime() ?? 0) - (row?.starts_at?.getTime() ?? 0)) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(364);
    expect(days).toBeLessThanOrEqual(367);
  });

  it("failed provider payment grants no Premium entitlement", async () => {
    if (!database) throw new Error("Database unavailable.");
    const cfg = config();
    const commercial = createCommercialService({ pool: database.pool, config: cfg });
    const client: JazzCashV11Client = {
      charge: vi.fn(async (input) => ({
        pp_ResponseCode: "124",
        pp_ResponseMessage: "Payment rejected",
        pp_TxnRefNo: input.txnRefNo,
      })),
      inquire: vi.fn(async () => ({ status: "FAILED" })),
    };
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config: cfg,
      commercialService: commercial,
      client,
    });
    const userId = await createUser();

    const result = await billing.charge({
      userId,
      planCode: "premium-monthly",
      msisdn: "03000000003",
      mpin: "1111",
      cnic: "111111",
      idempotencyKey: `failed-${randomUUID()}`,
    });

    expect(result.order.status).toBe("failed");
    expect(result.providerResponseCode).toBe("124");
    const row = await entitlementEvidence(result.order.id);
    expect(row?.entitlement_count).toBe(0);
    expect(row?.entitlement_status).toBeNull();
  });

  it("duplicate retry does not double-charge or duplicate entitlement", async () => {
    if (!database) throw new Error("Database unavailable.");
    const cfg = config();
    const commercial = createCommercialService({ pool: database.pool, config: cfg });
    const client = successClient("RRN-IDEMPOTENT");
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config: cfg,
      commercialService: commercial,
      client,
    });
    const userId = await createUser();
    const idempotencyKey = `duplicate-${randomUUID()}`;
    const input = {
      userId,
      planCode: "premium-monthly" as const,
      msisdn: "03000000004",
      mpin: "1111",
      cnic: "111111",
      idempotencyKey,
    };

    const first = await billing.charge(input);
    const second = await billing.charge(input);

    expect(second.order.id).toBe(first.order.id);
    expect(second.order.status).toBe("succeeded");
    expect(client.charge).toHaveBeenCalledTimes(1);

    const counts = await database.pool.query<{ orders: number; entitlements: number }>(
      `select
         (select count(*)::integer from payment_orders where user_id = $1 and idempotency_key = $2) as orders,
         (select count(*)::integer from entitlements where source_order_id = $3) as entitlements`,
      [userId, idempotencyKey, first.order.id],
    );
    expect(counts.rows[0]).toEqual({ orders: 1, entitlements: 1 });
  });

  it("status inquiry reconciles an ambiguous pending charge to the authoritative final state", async () => {
    if (!database) throw new Error("Database unavailable.");
    const cfg = config();
    const commercial = createCommercialService({ pool: database.pool, config: cfg });
    const client: JazzCashV11Client = {
      charge: vi.fn(async () => {
        throw new JazzCashV11Error("simulated provider timeout");
      }),
      inquire: vi.fn(async ({ txnRefNo }) => ({
        status: "SUCCESS",
        rrn: `RRN-${txnRefNo.slice(-8)}`,
        authCode: "AUTH-INQUIRY",
      })),
    };
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config: cfg,
      commercialService: commercial,
      client,
    });
    const userId = await createUser();
    const idempotencyKey = `inquiry-${randomUUID()}`;

    await expect(
      billing.charge({
        userId,
        planCode: "premium-monthly",
        msisdn: "03000000005",
        mpin: "1111",
        cnic: "111111",
        idempotencyKey,
      }),
    ).rejects.toThrow("No Premium entitlement was granted");

    const pending = await database.pool.query<{ id: string; merchant_reference: string; status: string }>(
      "select id, merchant_reference, status from payment_orders where user_id = $1 and idempotency_key = $2",
      [userId, idempotencyKey],
    );
    expect(pending.rows[0]?.status).toBe("pending");

    const reconciled = await billing.inquire({
      userId,
      txnRefNo: pending.rows[0]!.merchant_reference,
    });
    expect(reconciled.providerResponseCode).toBe("SUCCESS");
    expect(reconciled.order.status).toBe("succeeded");

    const row = await entitlementEvidence(reconciled.order.id);
    expect(row?.entitlement_status).toBe("active");
    expect(row?.entitlement_count).toBe(1);
  });

  it("accepted refund corrects order and Premium entitlement exactly once", async () => {
    if (!database) throw new Error("Database unavailable.");
    const cfg = config();
    const commercial = createCommercialService({ pool: database.pool, config: cfg });
    const billing = createJazzCashV11BillingService({
      pool: database.pool,
      config: cfg,
      commercialService: commercial,
      client: successClient("RRN-REFUND-SOURCE"),
    });
    const userId = await createUser();

    const paid = await billing.charge({
      userId,
      planCode: "premium-monthly",
      msisdn: "03000000006",
      mpin: "1111",
      cnic: "111111",
      idempotencyKey: `refund-${randomUUID()}`,
    });
    expect(paid.order.status).toBe("succeeded");

    const refundDigest = "c".repeat(64);
    const cps: JazzCashCpsClient = {
      doTransaction: async () => {
        throw new Error("DoTransaction is not used in refund acceptance.");
      },
      inquire: async () => ({
        operation: "status",
        responseCode: "000",
        responseMessage: "Accepted",
        providerStatus: "SUCCESS",
        providerReference: "INQ-REFUND",
        signatureVerified: true,
        payloadDigest: "d".repeat(64),
        accepted: true,
      }),
      refund: async ({ merchantReference, amountMinor, currency }) => {
        expect(merchantReference).toBe(paid.order.merchantReference);
        expect(amountMinor).toBe(59_900);
        expect(currency).toBe("PKR");
        return {
          operation: "refund",
          responseCode: "000",
          responseMessage: "Refund accepted",
          providerStatus: "REFUNDED",
          providerReference: "RRN-REFUND",
          signatureVerified: true,
          payloadDigest: refundDigest,
          accepted: true,
        };
      },
    };

    await database.pool.query(
      `insert into commercial_jobs (job_type, order_id, status, run_after)
       values ('provider_refund', $1, 'queued', now())`,
      [paid.order.id],
    );
    const automation = createCommercialAutomationService({
      pool: database.pool,
      jazzCashCps: cps,
    });
    await automation.process(25);

    const row = await entitlementEvidence(paid.order.id);
    expect(row).toMatchObject({
      order_status: "refunded",
      entitlement_status: "refunded",
      entitlement_count: 1,
    });

    const refundEvents = await database.pool.query<{ count: number }>(
      `select count(*)::integer as count
         from entitlement_events ee
         join entitlements e on e.id = ee.entitlement_id
        where e.source_order_id = $1 and ee.action = 'refund'`,
      [paid.order.id],
    );
    expect(refundEvents.rows[0]?.count).toBe(1);
  });
});
