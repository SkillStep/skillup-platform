import { createHmac, randomBytes } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.SESSION_SECRET;
const cookieName = process.env.SESSION_COOKIE_NAME ?? "skillup_session";
if (!databaseUrl || !secret) throw new Error("DATABASE_URL/SESSION_SECRET required");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
const now = new Date();
const email = "local-wallet-link@skillup.test";

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
  if (!created) throw new Error("Could not create user");
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
const expires = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
const idle = new Date(now.getTime() + 60 * 60 * 1000);
await client.query(
  `insert into auth_sessions
    (user_id, token_digest, expires_at, idle_expires_at, last_seen_at, created_at)
   values ($1, $2, $3, $4, $5, $5)`,
  [userId, tokenDigest, expires, idle, now],
);
await client.end();

console.log(
  JSON.stringify({
    cookieName,
    sessionToken,
    userId,
    email,
    cookieHeader: `${cookieName}=${encodeURIComponent(sessionToken)}`,
  }),
);
