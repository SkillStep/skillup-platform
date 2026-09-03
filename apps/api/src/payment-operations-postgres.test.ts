import { randomUUID } from "node:crypto";

import { createDatabaseClient } from "@skillup/database";
import { afterAll, describe, expect, it } from "vitest";

import type { AdminIdentity } from "./admin.js";
import { createAdminService } from "./admin.js";
import { createCommercialService, jazzCashSecureHash } from "./commercial.js";
import { readApiConfig } from "./config.js";
import { createPaymentOperationsService } from "./payment-operations.js";

const databaseUrl = process.env["DATABASE_URL"];
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const database = databaseUrl
  ? createDatabaseClient({
      connectionString: databaseUrl,
      applicationName: "skillup-payment-operations-test",
      maxConnections: 4,
    })
  : null;

afterAll(async () => {
  await database?.close();
});

describeWithPostgres("payment-operator provider actions against PostgreSQL", () => {
  it("queues idempotent status/refund jobs without accepting a client refund amount", async () => {
    if (!database || !databaseUrl) {
      throw new Error("DATABASE_URL is required for the payment operations test.");
    }
    const config = readApiConfig({
      APP_ENV: "test",
      PUBLIC_APP_URL: "https://skillup.example",
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "payment-operations-test-secret-at-least-32-bytes",
      FEATURE_PREMIUM_ENABLED: "true",
      FEATURE_JAZZCASH_ENABLED: "true",
      JAZZCASH_MODE: "sandbox",
      JAZZCASH_MERCHANT_ID: "OPS-TEST-MERCHANT",
      JAZZCASH_PASSWORD: "ops-test-password",
      JAZZCASH_INTEGRITY_SALT: "ops-test-integrity-salt",
      JAZZCASH_PAYMENT_URL: "https://sandbox.example/checkout",
      JAZZCASH_RETURN_URL: "https://skillup.example/en/account/payment-return",
      JAZZCASH_STATUS_URL: "https://sandbox.example/status",
      JAZZCASH_REFUND_URL: "https://sandbox.example/refund",
      RELEASE_SHA: "payment-operations-test",
    });
    const user = await database.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id",
    );
    const userId = user.rows[0]?.id;
    expect(userId).toBeTruthy();
    if (!userId) return;

    const commercial = createCommercialService({ pool: database.pool, config });
    const checkout = await commercial.createOrder({
      userId,
      planCode: "premium-monthly",
      idempotencyKey: `ops-${randomUUID()}`,
    });
    const salt = config.JAZZCASH_INTEGRITY_SALT;
    expect(salt).toBeTruthy();
    if (!salt) return;
    const fields: Record<string, string> = {
      pp_TxnRefNo: checkout.order.merchantReference,
      pp_Amount: String(checkout.order.amountMinor),
      pp_TxnCurrency: "PKR",
      pp_ResponseCode: "000",
      pp_RetreivalReferenceNo: `ops-settled-${randomUUID()}`,
    };
    await commercial.handleJazzCashCallback({
      ...fields,
      pp_SecureHash: jazzCashSecureHash(fields, salt),
    });

    const adminService = createAdminService({
      pool: database.pool,
      releaseSha: "payment-operations-test",
    });
    const operations = createPaymentOperationsService({ pool: database.pool, adminService });
    const actor: AdminIdentity = {
      userId,
      roles: ["payment_operator"],
      capabilities: ["payment.reconcile"],
    };

    const status = await operations.queueStatusInquiry(
      actor,
      checkout.order.id,
      { reason: "Sandbox status verification" },
      `status-${randomUUID()}`,
    );
    expect(status.state).toBe("queued");
    const duplicateStatus = await operations.queueStatusInquiry(
      actor,
      checkout.order.id,
      { reason: "Repeat sandbox status verification" },
      `status-repeat-${randomUUID()}`,
    );
    expect(duplicateStatus).toMatchObject({
      state: "already_queued",
      jobId: status.jobId,
    });

    const refund = await operations.queueRefund(
      actor,
      checkout.order.id,
      { reason: "Sandbox full refund verification" },
      `refund-${randomUUID()}`,
    );
    expect(refund.state).toBe("queued");
    const duplicateRefund = await operations.queueRefund(
      actor,
      checkout.order.id,
      { reason: "Repeat sandbox full refund verification" },
      `refund-repeat-${randomUUID()}`,
    );
    expect(duplicateRefund).toMatchObject({
      state: "already_queued",
      jobId: refund.jobId,
    });

    const jobs = await database.pool.query<{ job_type: string; count: number }>(
      `select job_type, count(*)::integer as count
         from commercial_jobs
        where order_id = $1 and job_type in ('provider_status','provider_refund')
        group by job_type
        order by job_type`,
      [checkout.order.id],
    );
    expect(jobs.rows).toEqual([
      { job_type: "provider_refund", count: 1 },
      { job_type: "provider_status", count: 1 },
    ]);
  });
});
