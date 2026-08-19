import { randomUUID } from "node:crypto";

import { createDatabaseClient, requireDatabaseUrl } from "../index.js";

type AdminRole =
  | "content_editor"
  | "content_reviewer"
  | "publisher"
  | "learner_support"
  | "payment_operator"
  | "analyst"
  | "security_admin";

const allAdminRoles: readonly AdminRole[] = [
  "content_editor",
  "content_reviewer",
  "publisher",
  "learner_support",
  "payment_operator",
  "analyst",
  "security_admin",
];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (required("APP_ENV") !== "staging") {
  throw new Error("staging-qa-provision may only run with APP_ENV=staging.");
}
if (required("STAGING_QA_PROVISION_CONFIRM") !== "I_UNDERSTAND_THIS_MUTATES_STAGING_QA_FIXTURES") {
  throw new Error(
    "STAGING_QA_PROVISION_CONFIRM must exactly confirm the staging-only QA fixture mutation.",
  );
}

const releaseSha = required("RELEASE_SHA");
const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-staging-qa-provision",
  maxConnections: 1,
});

const connection = await client.pool.connect();

async function resolveVerifiedUser(email: string): Promise<string> {
  const result = await connection.query<{ user_id: string }>(
    `select e.user_id
       from user_email_identities e
       join users u on u.id = e.user_id
      where e.email_normalized = $1
        and e.verified_at is not null
        and u.status = 'active'`,
    [email.trim().toLowerCase()],
  );
  const userId = result.rows[0]?.user_id;
  if (!userId) throw new Error(`Verified active staging QA account not found for ${email}.`);
  return userId;
}

async function audit(
  userId: string,
  action: string,
  reason: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await connection.query(
    `insert into privileged_audit_events (
       actor_user_id, actor_role, action, target_type, target_id, result,
       reason, correlation_id, release_sha, metadata
     ) values (null, 'staging_qa_provisioner', $1, 'user', $2, 'succeeded', $3, $4, $5, $6::jsonb)`,
    [action, userId, reason, randomUUID(), releaseSha, JSON.stringify(metadata)],
  );
}

async function provisionRoles(email: string, roles: readonly AdminRole[]): Promise<void> {
  const userId = await resolveVerifiedUser(email);
  await connection.query(
    `insert into admin_principals (user_id, status, created_at)
     values ($1, 'active', now())
     on conflict (user_id) do update
       set status = 'active', suspended_at = null`,
    [userId],
  );

  await connection.query(
    `update admin_role_assignments
        set revoked_at = coalesce(revoked_at, now())
      where user_id = $1
        and revoked_at is null
        and not (role = any($2::text[]))`,
    [userId, roles],
  );

  for (const role of roles) {
    await connection.query(
      `insert into admin_role_assignments (user_id, role, reason, created_at)
       values ($1, $2, $3, now())
       on conflict (user_id, role) where revoked_at is null do nothing`,
      [userId, role, "Deterministic staging certification persona"],
    );
  }

  await audit(userId, "staging_qa.roles_provisioned", "Prepare deterministic staging certification role fixture", {
    roles,
  });
}

async function provisionRevokedAdmin(email: string): Promise<void> {
  const userId = await resolveVerifiedUser(email);
  await connection.query(
    `insert into admin_principals (user_id, status, created_at)
     values ($1, 'revoked', now())
     on conflict (user_id) do update
       set status = 'revoked', suspended_at = null`,
    [userId],
  );
  await connection.query(
    `update admin_role_assignments
        set revoked_at = coalesce(revoked_at, now())
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
  await audit(userId, "staging_qa.admin_revoked", "Prepare revoked administrator certification fixture");
}

async function provisionPremiumLearner(email: string): Promise<void> {
  const userId = await resolveVerifiedUser(email);
  const plan = await connection.query<{ id: string }>(
    `select v.id
       from commercial_plan_versions v
       join commercial_plans p on p.id = v.plan_id
      where p.code = 'premium-monthly'
        and p.status = 'active'
        and v.status = 'active'
      order by v.version desc
      limit 1`,
  );
  const planVersionId = plan.rows[0]?.id;
  if (!planVersionId) throw new Error("Active premium-monthly plan version is required for staging QA.");

  const current = await connection.query<{ id: string; status: string }>(
    `select id, status
       from entitlements
      where user_id = $1
        and status in ('active', 'grace')
      order by ends_at desc
      limit 1
      for update`,
    [userId],
  );

  const existing = current.rows[0];
  if (existing) {
    await connection.query(
      `update entitlements
          set plan_version_id = $2,
              status = 'active',
              starts_at = now() - interval '1 day',
              ends_at = now() + interval '45 days',
              grace_ends_at = null,
              cancelled_at = null,
              revoked_at = null,
              updated_at = now()
        where id = $1`,
      [existing.id, planVersionId],
    );
    await connection.query(
      `insert into entitlement_events
        (entitlement_id, action, actor_type, reason, previous_status, next_status, created_at)
       values ($1, 'staging_qa_refresh', 'system', $2, $3, 'active', now())`,
      [existing.id, "Refresh deterministic Premium staging certification entitlement", existing.status],
    );
  } else {
    const inserted = await connection.query<{ id: string }>(
      `insert into entitlements
        (user_id, plan_version_id, source_order_id, status, starts_at, ends_at, created_at, updated_at)
       values ($1, $2, null, 'active', now() - interval '1 day', now() + interval '45 days', now(), now())
       returning id`,
      [userId, planVersionId],
    );
    const entitlementId = inserted.rows[0]?.id;
    if (!entitlementId) throw new Error("Premium staging entitlement could not be created.");
    await connection.query(
      `insert into entitlement_events
        (entitlement_id, action, actor_type, reason, previous_status, next_status, created_at)
       values ($1, 'staging_qa_grant', 'system', $2, null, 'active', now())`,
      [entitlementId, "Grant deterministic Premium staging certification entitlement"],
    );
  }

  await audit(userId, "staging_qa.premium_ready", "Prepare Premium learner certification fixture", {
    planCode: "premium-monthly",
  });
}

async function provisionFreeLearner(email: string): Promise<void> {
  const userId = await resolveVerifiedUser(email);
  const active = await connection.query<{ id: string; status: string }>(
    `select id, status from entitlements where user_id = $1 and status in ('active', 'grace') for update`,
    [userId],
  );
  for (const entitlement of active.rows) {
    await connection.query(
      `update entitlements
          set status = 'revoked', revoked_at = now(), updated_at = now()
        where id = $1`,
      [entitlement.id],
    );
    await connection.query(
      `insert into entitlement_events
        (entitlement_id, action, actor_type, reason, previous_status, next_status, created_at)
       values ($1, 'staging_qa_revoke', 'system', $2, $3, 'revoked', now())`,
      [entitlement.id, "Ensure deterministic free-tier staging certification fixture", entitlement.status],
    );
  }
  await audit(userId, "staging_qa.free_ready", "Prepare free learner certification fixture");
}

try {
  await connection.query("begin");

  await provisionPremiumLearner(required("STAGING_QA_LEARNER_EMAIL"));
  await provisionFreeLearner(required("STAGING_QA_FREE_LEARNER_EMAIL"));

  await provisionRoles(required("STAGING_QA_ADMIN_EMAIL"), allAdminRoles);
  await provisionRoles(required("STAGING_QA_ANALYST_EMAIL"), ["analyst"]);
  await provisionRoles(required("STAGING_QA_CONTENT_EDITOR_EMAIL"), ["content_editor"]);
  await provisionRoles(required("STAGING_QA_CONTENT_REVIEWER_EMAIL"), ["content_reviewer"]);
  await provisionRoles(required("STAGING_QA_PUBLISHER_EMAIL"), ["publisher"]);
  await provisionRoles(required("STAGING_QA_PAYMENT_OPERATOR_EMAIL"), ["payment_operator"]);
  await provisionRoles(required("STAGING_QA_LEARNER_SUPPORT_EMAIL"), ["learner_support"]);
  await provisionRoles(required("STAGING_QA_SECURITY_ADMIN_EMAIL"), ["security_admin"]);
  await provisionRevokedAdmin(required("STAGING_QA_REVOKED_ADMIN_EMAIL"));

  await connection.query("commit");
  console.log("Deterministic staging QA role and entitlement fixtures are ready.");
} catch (error) {
  await connection.query("rollback").catch(() => undefined);
  throw error;
} finally {
  connection.release();
  await client.close();
}
