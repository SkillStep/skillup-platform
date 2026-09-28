import { createHmac, randomBytes, randomUUID } from "node:crypto";

import pg from "pg";

const databaseUrl = process.env["DATABASE_URL"];
const secret = process.env["SESSION_SECRET"];
const cookieName = process.env["SESSION_COOKIE_NAME"] ?? "skillup_session";
const apiBase = process.env["API_BASE_URL"] ?? "http://127.0.0.1:3001";
const origin = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";
const msisdn = process.env["TEST_MSISDN"] ?? "03123456789";

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
console.log("status", statusRes.status, await statusRes.text());

const linkRes = await fetch(new URL("/v1/premium/billing/jazzcash-v11/link/start", apiBase), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin,
    cookie,
  },
  body: JSON.stringify({
    planCode: "premium-monthly",
    msisdn,
    consentToAutoPay: true,
    idempotencyKey: `v11-link-${randomUUID()}`,
  }),
});
const linkText = await linkRes.text();
console.log("link_start_status", linkRes.status);
console.log("link_start_body", linkText.slice(0, 2_000));
