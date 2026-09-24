import { createHmac, randomBytes, randomUUID } from "node:crypto";

import pg from "pg";

const databaseUrl = process.env["DATABASE_URL"];
const secret = process.env["SESSION_SECRET"];
const cookieName = process.env["SESSION_COOKIE_NAME"] ?? "skillup_session";
const apiBase = process.env["API_BASE_URL"] ?? "http://127.0.0.1:3001";
const origin = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";
const msisdn = process.env["TEST_MSISDN"] ?? "03123456789";
const mpin = process.env["TEST_MPIN"] ?? "5555";
const cnic = process.env["TEST_CNIC"] ?? "345678";

if (!databaseUrl || !secret) {
  throw new Error("DATABASE_URL and SESSION_SECRET are required.");
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const now = new Date();
const email = "local-jazzcash-v11@skillup.test";
let userId: string;
const existing = await client.query<{ user_id: string }>(
  "select user_id from user_email_identities where email_normalized = $1",
  [email],
);
if (existing.rows[0]) {
  userId = existing.rows[0].user_id;
} else {
  const user = await client.query<{ id: string }>(
    "insert into users (status, created_at, updated_at) values ('active', $1, $1) returning id",
    [now],
  );
  const created = user.rows[0]?.id;
  if (!created) throw new Error("Could not create local learner.");
  userId = created;
  await client.query(
    `insert into user_email_identities
      (user_id, email_normalized, email_display, verified_at, created_at, updated_at)
     values ($1, $2, $2, $3, $3, $3)`,
    [userId, email, now],
  );
  await client.query(
    "insert into learner_profiles (user_id, created_at, updated_at) values ($1, $2, $2)",
    [userId, now],
  );
}

const sessionToken = randomBytes(32).toString("base64url");
const tokenDigest = createHmac("sha256", secret).update(`session:${sessionToken}`).digest("hex");
const expires = new Date(now.getTime() + 7 * 24 * 3_600_000);
const idle = new Date(now.getTime() + 60 * 60_000);
await client.query(
  `insert into auth_sessions
    (user_id, token_digest, expires_at, idle_expires_at, last_seen_at, created_at)
   values ($1, $2, $3, $4, $5, $5)`,
  [userId, tokenDigest, expires, idle, now],
);
await client.end();

const cookie = `${cookieName}=${encodeURIComponent(sessionToken)}`;

const statusRes = await fetch(new URL("/v1/premium/billing/jazzcash-v11/status", apiBase));
const statusBody = await statusRes.json();
console.log("status", statusRes.status, JSON.stringify(statusBody));

const plansRes = await fetch(new URL("/v1/commercial/plans", apiBase));
const plansBody = (await plansRes.json()) as {
  plans?: ReadonlyArray<{
    code: string;
    checkoutAvailable: boolean;
    checkoutMode?: string | null;
    amountMinor: number;
  }>;
};
console.log(
  "plans",
  plansRes.status,
  JSON.stringify(
    plansBody.plans?.map((plan) => ({
      code: plan.code,
      checkoutAvailable: plan.checkoutAvailable,
      checkoutMode: plan.checkoutMode ?? null,
      amountMinor: plan.amountMinor,
    })),
  ),
);

const chargeRes = await fetch(new URL("/v1/premium/billing/jazzcash-v11/charge", apiBase), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin,
    cookie,
  },
  body: JSON.stringify({
    planCode: "premium-monthly",
    msisdn,
    mpin,
    cnic,
    idempotencyKey: `v11-local-${randomUUID()}`,
  }),
});
const chargeText = await chargeRes.text();
console.log("charge_status", chargeRes.status);
console.log("charge_body", chargeText.slice(0, 2_000));

try {
  const parsed = JSON.parse(chargeText) as {
    order?: { status?: string; merchantReference?: string; id?: string };
    providerResponseCode?: string | null;
    providerResponseMessage?: string | null;
  };
  if (parsed.order?.merchantReference) {
    const inquiryRes = await fetch(new URL("/v1/premium/billing/jazzcash-v11/inquiry", apiBase), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie,
      },
      body: JSON.stringify({ txnRefNo: parsed.order.merchantReference }),
    });
    const inquiryText = await inquiryRes.text();
    console.log("inquiry_status", inquiryRes.status);
    console.log("inquiry_body", inquiryText.slice(0, 1_500));
  }

  const accountRes = await fetch(new URL("/v1/commercial/account", apiBase), {
    headers: { origin, cookie },
  });
  const accountText = await accountRes.text();
  console.log("account_status", accountRes.status);
  console.log("account_body", accountText.slice(0, 1_500));

  const capsRes = await fetch(new URL("/v1/account/capabilities", apiBase), {
    headers: { origin, cookie },
  });
  const capsText = await capsRes.text();
  console.log("capabilities_status", capsRes.status);
  console.log("capabilities_body", capsText.slice(0, 1_000));

  if (parsed.providerResponseCode === "000" && parsed.order?.status !== "succeeded") {
    throw new Error(
      `Expected succeeded order after JazzCash 000; got status=${parsed.order?.status ?? "missing"}`,
    );
  }
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Expected succeeded")) {
    throw error;
  }
  // charge body may be non-JSON on hard failures
}
