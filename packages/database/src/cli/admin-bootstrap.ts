import { randomUUID } from "node:crypto";

import { createDatabaseClient, requireDatabaseUrl } from "../index.js";

const allowedRoles = new Set([
  "content_editor",
  "content_reviewer",
  "publisher",
  "learner_support",
  "payment_operator",
  "analyst",
  "security_admin",
]);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const confirmation = required("ADMIN_BOOTSTRAP_CONFIRM");
if (confirmation !== "I_UNDERSTAND_THIS_GRANTS_PRIVILEGED_ACCESS") {
  throw new Error("ADMIN_BOOTSTRAP_CONFIRM must exactly confirm the privileged-access operation.");
}

const email = required("ADMIN_BOOTSTRAP_EMAIL").toLowerCase();
const reason = required("ADMIN_BOOTSTRAP_REASON");
if (reason.length < 8 || reason.length > 500) {
  throw new Error("ADMIN_BOOTSTRAP_REASON must be between 8 and 500 characters.");
}

const roles = [
  ...new Set(
    required("ADMIN_BOOTSTRAP_ROLES")
      .split(",")
      .map((role) => role.trim()),
  ),
];
if (roles.length === 0 || roles.some((role) => !allowedRoles.has(role))) {
  throw new Error(`ADMIN_BOOTSTRAP_ROLES contains an unsupported role: ${roles.join(", ")}`);
}

const releaseSha = process.env["RELEASE_SHA"]?.trim() || "manual-bootstrap";
const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-admin-bootstrap",
  maxConnections: 1,
});

try {
  const connection = await client.pool.connect();
  try {
    await connection.query("begin");
    const identity = await connection.query<{ user_id: string }>(
      `select e.user_id
         from user_email_identities e
         join users u on u.id = e.user_id
        where e.email_normalized = $1
          and u.status = 'active'
        for update`,
      [email],
    );
    const userId = identity.rows[0]?.user_id;
    if (!userId) {
      throw new Error(
        "The bootstrap email must already belong to an active, verified SkillUp account.",
      );
    }

    await connection.query(
      `insert into admin_principals (user_id, status, created_at)
       values ($1, 'active', now())
       on conflict (user_id) do update
         set status = 'active', suspended_at = null`,
      [userId],
    );

    for (const role of roles) {
      await connection.query(
        `insert into admin_role_assignments (user_id, role, reason, created_at)
         values ($1, $2, $3, now())
         on conflict (user_id, role) where revoked_at is null do nothing`,
        [userId, role, reason],
      );
    }

    await connection.query(
      `insert into privileged_audit_events (
         actor_user_id,
         actor_role,
         action,
         target_type,
         target_id,
         result,
         reason,
         correlation_id,
         release_sha,
         metadata
       )
       values (
         null,
         'bootstrap',
         'admin.bootstrap',
         'user',
         $1,
         'succeeded',
         $2,
         $3,
         $4,
         jsonb_build_object('emailDigest', encode(digest($5, 'sha256'), 'hex'), 'roles', $6::jsonb)
       )`,
      [userId, reason, randomUUID(), releaseSha, email, JSON.stringify(roles)],
    );

    await connection.query("commit");
    console.log(
      `Administrative access granted to verified account ${userId} for roles: ${roles.join(", ")}.`,
    );
  } catch (error) {
    await connection.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
} finally {
  await client.close();
}
