import { randomUUID } from "node:crypto";

import { createDatabaseClient, requireDatabaseUrl } from "@skillup/database";

import { createCommercialService, jazzCashSecureHash } from "./commercial.js";
import { readApiConfig } from "./config.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

function hasStatusCode(error: unknown, expectedStatusCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode?: unknown }).statusCode === expectedStatusCode
  );
}

async function expectRejected(
  operation: () => Promise<unknown>,
  expectedStatusCode: number,
  message: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (hasStatusCode(error, expectedStatusCode)) return;
    throw error;
  }
  throw new Error(message);
}

const databaseUrl = requireDatabaseUrl();
const config = readApiConfig({
  APP_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "3001",
  PUBLIC_APP_URL: "https://skillup.example",
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: "4",
  SESSION_COOKIE_NAME: "skillup_session",
  SESSION_SECRET: "commercial-lifecycle-smoke-secret-at-least-32-bytes",
  EMAIL_PROVIDER: "disabled",
  FEATURE_PREMIUM_ENABLED: "true",
  FEATURE_JAZZCASH_ENABLED: "true",
  JAZZCASH_MODE: "sandbox",
  JAZZCASH_MERCHANT_ID: "SMOKE-MERCHANT",
  JAZZCASH_PASSWORD: "smoke-password",
  JAZZCASH_INTEGRITY_SALT: "smoke-integrity-salt",
  JAZZCASH_PAYMENT_URL: "https://sandbox.jazzcash.example/checkout",
  JAZZCASH_RETURN_URL: "https://skillup.example/en/account/payment-return",
  RELEASE_SHA: "commercial-lifecycle-smoke",
  LOG_LEVEL: "silent",
});

const client = createDatabaseClient({
  connectionString: databaseUrl,
  applicationName: "skillup-commercial-lifecycle-smoke",
  maxConnections: 4,
});
const service = createCommercialService({ pool: client.pool, config });
const integritySalt = config.JAZZCASH_INTEGRITY_SALT;
assert(integritySalt, "The lifecycle smoke requires an integrity salt.");

let userId: string | null = null;

try {
  const user = await client.pool.query<{ id: string }>(
    "insert into users (status) values ('active') returning id",
  );
  userId = user.rows[0]?.id ?? null;
  assert(userId, "The commercial lifecycle smoke learner could not be created.");

  const successIdempotencyKey = `success-${randomUUID()}`;
  const checkout = await service.createOrder({
    userId,
    planCode: "premium-monthly",
    idempotencyKey: successIdempotencyKey,
  });
  const duplicateCheckout = await service.createOrder({
    userId,
    planCode: "premium-monthly",
    idempotencyKey: successIdempotencyKey,
  });
  assert(
    checkout.order.id === duplicateCheckout.order.id,
    "Repeated order creation must resolve the original idempotent payment order.",
  );
  assert(
    !Object.values(checkout.fields).includes(userId),
    "JazzCash checkout fields must not expose the learner user ID.",
  );

  const successProviderReference = `success-${randomUUID()}`;
  const spoofedCustomerId = randomUUID();
  const successFields = signedCallback(
    {
      pp_TxnRefNo: checkout.order.merchantReference,
      pp_Amount: String(checkout.order.amountMinor),
      pp_TxnCurrency: "PKR",
      pp_ResponseCode: "000",
      pp_RetreivalReferenceNo: successProviderReference,
      ppmpf_1: checkout.order.id,
      ppmpf_2: checkout.order.planCode,
      ppmpf_4: spoofedCustomerId,
    },
    integritySalt,
  );

  const succeeded = await service.handleJazzCashCallback(successFields);
  assert(succeeded.status === "succeeded", "A verified success callback must settle the order.");

  const activated = await client.pool.query<{
    id: string;
    user_id: string;
    status: string;
  }>("select id, user_id, status from entitlements where source_order_id = $1", [
    checkout.order.id,
  ]);
  const entitlement = activated.rows[0];
  assert(entitlement, "A verified payment must create an entitlement.");
  assert(
    entitlement.user_id === userId && entitlement.status === "active",
    "Entitlement ownership must come from the server-side order, not callback customer metadata.",
  );

  const replayed = await service.handleJazzCashCallback(successFields);
  assert(replayed.status === "succeeded", "A replay must preserve the settled order state.");

  const replayEvidence = await client.pool.query<{
    payment_events: number;
    entitlements: number;
  }>(
    `select
       (select count(*)::integer from payment_events where provider = 'jazzcash' and provider_event_id = $1) as payment_events,
       (select count(*)::integer from entitlements where source_order_id = $2) as entitlements`,
    [successProviderReference, checkout.order.id],
  );
  assert(
    replayEvidence.rows[0]?.payment_events === 1 && replayEvidence.rows[0].entitlements === 1,
    "A duplicate provider event must not duplicate payment evidence or entitlements.",
  );

  await expectRejected(
    () =>
      service.handleJazzCashCallback(
        signedCallback(
          {
            pp_TxnRefNo: "SU20990101000000ABCDEF12",
            pp_Amount: "59900",
            pp_TxnCurrency: "PKR",
            pp_ResponseCode: "000",
            pp_RetreivalReferenceNo: `unknown-${randomUUID()}`,
          },
          integritySalt,
        ),
      ),
    404,
    "A signed callback for an unknown merchant order must be rejected.",
  );

  const mismatchCheckout = await service.createOrder({
    userId,
    planCode: "premium-yearly",
    idempotencyKey: `mismatch-${randomUUID()}`,
  });

  const currencyProviderReference = `currency-${randomUUID()}`;
  await expectRejected(
    () =>
      service.handleJazzCashCallback(
        signedCallback(
          {
            pp_TxnRefNo: mismatchCheckout.order.merchantReference,
            pp_Amount: String(mismatchCheckout.order.amountMinor),
            pp_TxnCurrency: "USD",
            pp_ResponseCode: "000",
            pp_RetreivalReferenceNo: currencyProviderReference,
          },
          integritySalt,
        ),
      ),
    400,
    "A callback with a non-PKR currency must be rejected before order mutation.",
  );

  const rejectedCurrencyEvent = await client.pool.query<{ count: number }>(
    "select count(*)::integer as count from payment_events where provider_event_id = $1",
    [currencyProviderReference],
  );
  assert(
    rejectedCurrencyEvent.rows[0]?.count === 0,
    "A structurally invalid currency callback must not create payment evidence.",
  );

  const amountProviderReference = `amount-${randomUUID()}`;
  await expectRejected(
    () =>
      service.handleJazzCashCallback(
        signedCallback(
          {
            pp_TxnRefNo: mismatchCheckout.order.merchantReference,
            pp_Amount: String(mismatchCheckout.order.amountMinor + 100),
            pp_TxnCurrency: "PKR",
            pp_ResponseCode: "000",
            pp_RetreivalReferenceNo: amountProviderReference,
          },
          integritySalt,
        ),
      ),
    409,
    "A signed amount mismatch must be rejected and reconciled.",
  );

  const mismatchEvidence = await client.pool.query<{
    reconciliation_cases: number;
    order_status: string;
  }>(
    `select
       (select count(*)::integer
          from reconciliation_cases
         where order_id = $1 and mismatch_kind = 'amount' and status = 'open') as reconciliation_cases,
       (select status from payment_orders where id = $1) as order_status`,
    [mismatchCheckout.order.id],
  );
  assert(
    mismatchEvidence.rows[0]?.reconciliation_cases === 1 &&
      mismatchEvidence.rows[0].order_status === "pending",
    "An amount mismatch must persist one open reconciliation case without granting access.",
  );

  const refundProviderReference = `refund-${randomUUID()}`;
  const refunded = await service.handleJazzCashCallback(
    signedCallback(
      {
        pp_TxnRefNo: checkout.order.merchantReference,
        pp_Amount: String(checkout.order.amountMinor),
        pp_TxnCurrency: "PKR",
        pp_ResponseCode: "131",
        pp_RetreivalReferenceNo: refundProviderReference,
      },
      integritySalt,
    ),
  );
  assert(refunded.status === "refunded", "A verified refund must update the payment order.");

  const refundEvidence = await client.pool.query<{
    entitlement_status: string;
    refund_events: number;
    active_capabilities: number;
  }>(
    `select
       (select status from entitlements where source_order_id = $1) as entitlement_status,
       (select count(*)::integer
          from entitlement_events ee
          join entitlements e on e.id = ee.entitlement_id
         where e.source_order_id = $1 and ee.action = 'refund') as refund_events,
       (select count(*)::integer from active_user_capabilities where user_id = $2) as active_capabilities`,
    [checkout.order.id, userId],
  );
  assert(
    refundEvidence.rows[0]?.entitlement_status === "refunded" &&
      refundEvidence.rows[0].refund_events === 1 &&
      refundEvidence.rows[0].active_capabilities === 0,
    "A verified refund must revoke active capabilities and append refund evidence.",
  );

  console.log(
    "SkillUp commercial lifecycle smoke passed (idempotent checkout, signed success, replay protection, order/customer binding, mismatch reconciliation and refund revocation verified).",
  );
} finally {
  if (userId) {
    await client.pool.query(
      "delete from reconciliation_cases where order_id in (select id from payment_orders where user_id = $1)",
      [userId],
    );
    await client.pool.query("delete from commercial_events where user_id = $1", [userId]);
    await client.pool.query(
      "delete from entitlement_events where entitlement_id in (select id from entitlements where user_id = $1)",
      [userId],
    );
    await client.pool.query("delete from entitlements where user_id = $1", [userId]);
    await client.pool.query(
      "delete from payment_events where order_id in (select id from payment_orders where user_id = $1)",
      [userId],
    );
    await client.pool.query("delete from payment_orders where user_id = $1", [userId]);
    await client.pool.query("delete from users where id = $1", [userId]);
  }
  await client.close();
}
