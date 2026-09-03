import { randomUUID } from "node:crypto";

import { createDatabaseClient } from "@skillup/database";
import { afterAll, describe, expect, it } from "vitest";

import { createCommercialAutomationService } from "./commercial-automation.js";
import { createCommercialService, jazzCashSecureHash } from "./commercial.js";
import { readApiConfig } from "./config.js";
import type { JazzCashCpsClient } from "./jazzcash-cps.js";

const databaseUrl = process.env["DATABASE_URL"];
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const database = databaseUrl
  ? createDatabaseClient({
      connectionString: databaseUrl,
      applicationName: "skillup-commercial-cps-test",
      maxConnections: 4,
    })
  : null;

afterAll(async () => {
  await database?.close();
});

function signedCallback(
  fields: Readonly<Record<string, string>>,
  integritySalt: string,
): Readonly<Record<string, string>> {
  return { ...fields, pp_SecureHash: jazzCashSecureHash(fields, integritySalt) };
}

describeWithPostgres("JazzCash CPS commercial jobs against PostgreSQL", () => {
  it("records status evidence and completes a full provider refund idempotently", async () => {
    if (!database || !databaseUrl) throw new Error("DATABASE_URL is required for the CPS test.");

    const config = readApiConfig({
      APP_ENV: "test",
      PUBLIC_APP_URL: "https://skillup.example",
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "commercial-cps-test-secret-at-least-32-bytes",
      FEATURE_PREMIUM_ENABLED: "true",
      FEATURE_JAZZCASH_ENABLED: "true",
      JAZZCASH_MODE: "sandbox",
      JAZZCASH_MERCHANT_ID: "CPS-TEST-MERCHANT",
      JAZZCASH_PASSWORD: "cps-test-password",
      JAZZCASH_INTEGRITY_SALT: "cps-test-integrity-salt",
      JAZZCASH_PAYMENT_URL: "https://sandbox.example/checkout",
      JAZZCASH_RETURN_URL: "https://skillup.example/en/account/payment-return",
      JAZZCASH_STATUS_URL: "https://sandbox.example/status",
      JAZZCASH_REFUND_URL: "https://sandbox.example/refund",
    });
    const commercial = createCommercialService({ pool: database.pool, config });
    const user = await database.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id",
    );
    const userId = user.rows[0]?.id;
    expect(userId).toBeTruthy();
    if (!userId) return;

    const checkout = await commercial.createOrder({
      userId,
      planCode: "premium-monthly",
      idempotencyKey: `cps-${randomUUID()}`,
    });
    const integritySalt = config.JAZZCASH_INTEGRITY_SALT;
    expect(integritySalt).toBeTruthy();
    if (!integritySalt) return;

    await commercial.handleJazzCashCallback(
      signedCallback(
        {
          pp_TxnRefNo: checkout.order.merchantReference,
          pp_Amount: String(checkout.order.amountMinor),
          pp_TxnCurrency: "PKR",
          pp_ResponseCode: "000",
          pp_RetreivalReferenceNo: `settled-${randomUUID()}`,
        },
        integritySalt,
      ),
    );

    const statusDigest = "a".repeat(64);
    const refundDigest = "b".repeat(64);
    const cps: JazzCashCpsClient = {
      inquire: async ({ merchantReference }) => ({
        operation: "status",
        responseCode: "000",
        responseMessage: "Inquiry accepted",
        providerStatus: "SUCCESS",
        providerReference: `inquiry-${merchantReference.slice(-8)}`,
        signatureVerified: null,
        payloadDigest: statusDigest,
        accepted: true,
      }),
      refund: async ({ merchantReference, amountMinor, currency }) => {
        expect(merchantReference).toBe(checkout.order.merchantReference);
        expect(amountMinor).toBe(checkout.order.amountMinor);
        expect(currency).toBe("PKR");
        return {
          operation: "refund",
          responseCode: "000",
          responseMessage: "Refund accepted",
          providerStatus: "REFUNDED",
          providerReference: `refund-${merchantReference.slice(-8)}`,
          signatureVerified: null,
          payloadDigest: refundDigest,
          accepted: true,
        };
      },
    };
    const automation = createCommercialAutomationService({ pool: database.pool, jazzCashCps: cps });

    await database.pool.query(
      `insert into commercial_jobs (job_type, order_id, status, run_after)
       values ('provider_status', $1, 'queued', now())`,
      [checkout.order.id],
    );
    const statusProcessed = await automation.process(25);
    expect(statusProcessed["provider_status"]).toBeGreaterThanOrEqual(1);

    const statusEvidence = await database.pool.query<{ count: number }>(
      `select count(*)::integer as count
         from payment_events
        where order_id = $1 and event_type = 'status_query' and payload_digest = $2`,
      [checkout.order.id, statusDigest],
    );
    expect(statusEvidence.rows[0]?.count).toBe(1);

    await database.pool.query(
      `insert into commercial_jobs (job_type, order_id, status, run_after)
       values ('provider_refund', $1, 'queued', now())`,
      [checkout.order.id],
    );
    const refundProcessed = await automation.process(25);
    expect(refundProcessed["provider_refund"]).toBeGreaterThanOrEqual(1);

    const refunded = await database.pool.query<{
      order_status: string;
      entitlement_status: string;
      refund_events: number;
      provider_events: number;
    }>(
      `select
         (select status from payment_orders where id = $1) as order_status,
         (select status from entitlements where source_order_id = $1) as entitlement_status,
         (select count(*)::integer
            from entitlement_events ee
            join entitlements e on e.id = ee.entitlement_id
           where e.source_order_id = $1 and ee.action = 'refund') as refund_events,
         (select count(*)::integer
            from payment_events
           where order_id = $1 and event_type = 'refund' and payload_digest = $2) as provider_events`,
      [checkout.order.id, refundDigest],
    );
    expect(refunded.rows[0]).toMatchObject({
      order_status: "refunded",
      entitlement_status: "refunded",
      refund_events: 1,
      provider_events: 1,
    });

    await database.pool.query(
      `insert into commercial_jobs (job_type, order_id, status, run_after)
       values ('provider_refund', $1, 'queued', now())`,
      [checkout.order.id],
    );
    await automation.process(25);
    const repeated = await database.pool.query<{ refund_events: number; provider_events: number }>(
      `select
         (select count(*)::integer
            from entitlement_events ee
            join entitlements e on e.id = ee.entitlement_id
           where e.source_order_id = $1 and ee.action = 'refund') as refund_events,
         (select count(*)::integer
            from payment_events
           where order_id = $1 and event_type = 'refund' and payload_digest = $2) as provider_events`,
      [checkout.order.id, refundDigest],
    );
    expect(repeated.rows[0]).toEqual({ refund_events: 1, provider_events: 1 });
  });
});
