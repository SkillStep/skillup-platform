import { randomUUID } from "node:crypto";

import { createDatabaseClient, requireDatabaseUrl } from "../index.js";

/**
 * Idempotently ensures the staging fixed-OTP operator account exists with admin roles.
 * Safe only for APP_ENV=staging. Never run against production.
 */
const STAGING_FIXED_ADMIN_EMAIL = "staging.admin@skillup.test";
const STAGING_FIXED_ADMIN_DISPLAY_NAME = "Staging Admin";

const allAdminRoles = [
  "content_editor",
  "content_reviewer",
  "publisher",
  "learner_support",
  "payment_operator",
  "analyst",
  "security_admin",
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (required("APP_ENV") !== "staging") {
  throw new Error("staging-fixed-admin-ensure may only run with APP_ENV=staging.");
}

const releaseSha = process.env["RELEASE_SHA"]?.trim() || "staging-fixed-admin-ensure";
const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-staging-fixed-admin-ensure",
  maxConnections: 1,
});

const connection = await client.pool.connect();

try {
  await connection.query("begin");

  const existing = await connection.query<{ user_id: string }>(
    `select e.user_id
       from user_email_identities e
       join users u on u.id = e.user_id
      where e.email_normalized = $1
        and u.status = 'active'
      for update`,
    [STAGING_FIXED_ADMIN_EMAIL],
  );

  let userId = existing.rows[0]?.user_id;
  const now = new Date();

  if (!userId) {
    const created = await connection.query<{ id: string }>(
      `insert into users (status, created_at, updated_at)
       values ('active', $1, $1)
       returning id`,
      [now],
    );
    userId = created.rows[0]?.id;
    if (!userId) throw new Error("Failed to create staging fixed admin user.");

    await connection.query(
      `insert into user_email_identities (
         user_id, email_normalized, email_display, verified_at, created_at, updated_at
       ) values ($1, $2, $2, $3, $3, $3)`,
      [userId, STAGING_FIXED_ADMIN_EMAIL, now],
    );

    await connection.query(
      `insert into learner_profiles (
         user_id, display_name, locale, age_band, onboarding_status, created_at, updated_at
       ) values ($1, $2, 'en', 'unspecified', 'completed', $3, $3)`,
      [userId, STAGING_FIXED_ADMIN_DISPLAY_NAME, now],
    );
  } else {
    await connection.query(
      `update user_email_identities
          set verified_at = coalesce(verified_at, $2),
              updated_at = $2
        where user_id = $1`,
      [userId, now],
    );
    await connection.query(
      `insert into learner_profiles (
         user_id, display_name, locale, age_band, onboarding_status, created_at, updated_at
       ) values ($1, $2, 'en', 'unspecified', 'completed', $3, $3)
       on conflict (user_id) do update
         set display_name = coalesce(learner_profiles.display_name, excluded.display_name),
             onboarding_status = 'completed',
             updated_at = excluded.updated_at`,
      [userId, STAGING_FIXED_ADMIN_DISPLAY_NAME, now],
    );
  }

  await connection.query(
    `insert into admin_principals (user_id, status, created_at)
     values ($1, 'active', now())
     on conflict (user_id) do update
       set status = 'active', suspended_at = null`,
    [userId],
  );

  for (const role of allAdminRoles) {
    await connection.query(
      `insert into admin_role_assignments (user_id, role, reason, created_at)
       values ($1, $2, $3, now())
       on conflict (user_id, role) where revoked_at is null do nothing`,
      [userId, role, "Staging fixed-OTP operator account"],
    );
  }

  await connection.query(
    `insert into privileged_audit_events (
       actor_user_id, actor_role, action, target_type, target_id, result,
       reason, correlation_id, release_sha, metadata
     ) values (
       null, 'staging_fixed_admin_ensure', 'admin.bootstrap', 'user', $1, 'succeeded',
       $2, $3, $4, $5::jsonb
     )`,
    [
      userId,
      "Ensure staging.admin@skillup.test fixed-OTP operator with admin roles",
      randomUUID(),
      releaseSha,
      JSON.stringify({ email: STAGING_FIXED_ADMIN_EMAIL, roles: allAdminRoles }),
    ],
  );

  await connection.query("commit");
  console.log(
    `Staging fixed admin ready: ${STAGING_FIXED_ADMIN_EMAIL} (${userId}) roles=${allAdminRoles.join(",")}`,
  );
} catch (error) {
  await connection.query("rollback").catch(() => undefined);
  throw error;
} finally {
  connection.release();
  await client.close();
}
