import { createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = await pool.connect();

const releaseSha = process.env.RELEASE_SHA;
const sessionSecret = process.env.SESSION_SECRET;
if (!releaseSha) throw new Error("RELEASE_SHA is unavailable in the API runtime.");
if (!sessionSecret) throw new Error("SESSION_SECRET is unavailable in the API runtime.");

const cookieName = process.env.SESSION_COOKIE_NAME || "skillup_session";
const absoluteHours = Number(process.env.SESSION_ABSOLUTE_HOURS || 168);
const idleMinutes = Number(process.env.SESSION_IDLE_MINUTES || 60);

const identities = {
  learner: "skillup+qa-learner@codistan.org",
  "free-learner": "skillup+qa-free-learner@codistan.org",
  onboarding: "skillup+qa-onboarding@codistan.org",
  admin: "skillup+qa-admin@codistan.org",
  analyst: "skillup+qa-analyst@codistan.org",
  "content-editor": "skillup+qa-content-editor@codistan.org",
  "content-reviewer": "skillup+qa-content-reviewer@codistan.org",
  publisher: "skillup+qa-publisher@codistan.org",
  "payment-operator": "skillup+qa-payment-operator@codistan.org",
  "learner-support": "skillup+qa-learner-support@codistan.org",
  "security-admin": "skillup+qa-security-admin@codistan.org",
  "revoked-admin": "skillup+qa-revoked-admin@codistan.org",
};

const roleMap = {
  admin: [
    "content_editor",
    "content_reviewer",
    "publisher",
    "learner_support",
    "payment_operator",
    "analyst",
    "security_admin",
  ],
  analyst: ["analyst"],
  "content-editor": ["content_editor"],
  "content-reviewer": ["content_reviewer"],
  publisher: ["publisher"],
  "payment-operator": ["payment_operator"],
  "learner-support": ["learner_support"],
  "security-admin": ["security_admin"],
  "revoked-admin": ["security_admin"],
};

function tokenDigest(token) {
  return createHmac("sha256", sessionSecret).update(`session:${token}`).digest("hex");
}

async function ensureUser(email, profileStatus = "completed") {
  const normalized = email.trim().toLowerCase();
  const found = await db.query(
    "select user_id from user_email_identities where email_normalized = $1",
    [normalized],
  );
  let userId = found.rows[0]?.user_id;

  if (!userId) {
    const user = await db.query(
      "insert into users (status, created_at, updated_at) values ('active', now(), now()) returning id",
    );
    userId = user.rows[0]?.id;
    if (!userId) throw new Error(`Could not create staging QA user for ${normalized}.`);
    await db.query(
      `insert into user_email_identities
        (user_id, email_normalized, email_display, verified_at, created_at, updated_at)
       values ($1, $2, $2, now(), now(), now())`,
      [userId, normalized],
    );
  } else {
    await db.query(
      `update users
          set status = 'active', deletion_requested_at = null, deleted_at = null, updated_at = now()
        where id = $1`,
      [userId],
    );
  }

  await db.query(
    `insert into learner_profiles
      (user_id, display_name, locale, age_band, learning_goal, onboarding_status, created_at, updated_at)
     values ($1, 'Staging QA', 'en', '18_24', 'Automated staging UAT certification', $2, now(), now())
     on conflict (user_id) do update
       set display_name = excluded.display_name,
           locale = excluded.locale,
           age_band = excluded.age_band,
           learning_goal = excluded.learning_goal,
           onboarding_status = excluded.onboarding_status,
           updated_at = now()`,
    [userId, profileStatus],
  );
  return userId;
}

async function auditFixture(userId, action, metadata) {
  await db.query(
    `insert into privileged_audit_events
      (actor_user_id, actor_role, action, target_type, target_id, result,
       reason, correlation_id, release_sha, metadata)
     values (null, 'bootstrap', $1, 'user', $2, 'succeeded',
             'Staging UAT certification fixture', $3, $4, $5::jsonb)`,
    [action, userId, randomUUID(), releaseSha, JSON.stringify(metadata)],
  );
}

const sessions = {};
try {
  await db.query("begin");

  const userIds = {};
  for (const [name, email] of Object.entries(identities)) {
    userIds[name] = await ensureUser(email, name === "onboarding" ? "in_progress" : "completed");
  }

  for (const [name, roles] of Object.entries(roleMap)) {
    const userId = userIds[name];
    await db.query(
      `insert into admin_principals (user_id, status, created_at)
       values ($1, 'active', now())
       on conflict (user_id) do update set status = 'active', suspended_at = null`,
      [userId],
    );
    for (const role of roles) {
      await db.query(
        `insert into admin_role_assignments (user_id, role, reason, created_at)
         select $1, $2, 'Staging UAT certification fixture', now()
          where not exists (
            select 1 from admin_role_assignments
             where user_id = $1 and role = $2 and revoked_at is null
          )`,
        [userId, role],
      );
    }
    await auditFixture(userId, "admin.qa_fixture", { roles });
  }

  const learnerId = userIds.learner;
  const freeId = userIds["free-learner"];
  const plan = await db.query(
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
  if (!planVersionId) throw new Error("Active premium-monthly plan version is missing.");

  const activePremium = await db.query(
    `select id from entitlements
      where user_id = $1
        and status in ('active', 'grace')
        and coalesce(grace_ends_at, ends_at) > now()
      order by ends_at desc
      limit 1`,
    [learnerId],
  );
  if (!activePremium.rows[0]?.id) {
    const entitlement = await db.query(
      `insert into entitlements
        (user_id, plan_version_id, source_order_id, status, starts_at, ends_at, created_at, updated_at)
       values ($1, $2, null, 'active', now() - interval '1 minute', now() + interval '30 days', now(), now())
       returning id`,
      [learnerId, planVersionId],
    );
    await db.query(
      `insert into entitlement_events
        (entitlement_id, action, actor_type, reason, evidence_reference, previous_status, next_status)
       values ($1, 'qa_fixture_grant', 'system', 'Staging UAT certification premium fixture', $2, null, 'active')`,
      [entitlement.rows[0].id, `release:${releaseSha}`],
    );
  }

  const freeEntitlements = await db.query(
    `update entitlements
        set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
      where user_id = $1 and status in ('active', 'grace')
      returning id`,
    [freeId],
  );
  for (const row of freeEntitlements.rows) {
    await db.query(
      `insert into entitlement_events
        (entitlement_id, action, actor_type, reason, evidence_reference, previous_status, next_status)
       values ($1, 'qa_fixture_revoke', 'system', 'Maintain deterministic free learner fixture', $2, 'active', 'revoked')`,
      [row.id, `release:${releaseSha}`],
    );
  }

  await db.query("delete from learner_daily_mission_usage where user_id in ($1, $2)", [learnerId, freeId]);

  const revokedId = userIds["revoked-admin"];
  await db.query(
    "update admin_role_assignments set revoked_at = coalesce(revoked_at, now()) where user_id = $1 and revoked_at is null",
    [revokedId],
  );
  await db.query(
    "update admin_principals set status = 'revoked', suspended_at = coalesce(suspended_at, now()) where user_id = $1",
    [revokedId],
  );
  await auditFixture(revokedId, "admin.qa_revoke", { revoked: true });

  for (const [name, userId] of Object.entries(userIds)) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + absoluteHours * 3_600_000);
    const idleExpiresAt = new Date(now.getTime() + idleMinutes * 60_000);
    await db.query(
      `insert into auth_sessions
        (user_id, token_digest, expires_at, idle_expires_at, last_seen_at, created_at)
       values ($1, $2, $3, $4, $5, $5)`,
      [userId, tokenDigest(token), expiresAt, idleExpiresAt, now],
    );
    sessions[name] = token;
  }

  await db.query("commit");
  process.stdout.write(JSON.stringify({ cookieName, sessions }));
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally {
  db.release();
  await pool.end();
}
