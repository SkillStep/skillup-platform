import { randomUUID } from "node:crypto";

import { createDatabaseClient, requireDatabaseUrl } from "../index.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-launch-operations-smoke",
  maxConnections: 1,
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  const connection = await client.pool.connect();

  try {
    await connection.query("begin");

    const catalog = await connection.query<{
      code: string;
      amount_minor: number;
      billing_period: string;
    }>(
      `select code, amount_minor, billing_period
         from active_commercial_plan_catalog
        order by amount_minor`,
    );
    assert(catalog.rows.length === 2, "The launch catalog must expose two active premium plans.");
    assert(
      catalog.rows[0]?.code === "premium-monthly" && catalog.rows[0].amount_minor === 59_900,
      "The monthly launch plan must remain PKR 599.",
    );
    assert(
      catalog.rows[1]?.code === "premium-yearly" && catalog.rows[1].amount_minor === 499_900,
      "The yearly launch plan must remain PKR 4,999.",
    );

    const user = await connection.query<{ id: string }>(
      "insert into users (status) values ('active') returning id",
    );
    const userId = user.rows[0]?.id;
    assert(userId, "The smoke learner could not be created.");

    const planVersion = await connection.query<{ plan_version_id: string }>(
      "select plan_version_id from active_commercial_plan_catalog where code = 'premium-monthly'",
    );
    const planVersionId = planVersion.rows[0]?.plan_version_id;
    assert(planVersionId, "The monthly plan version could not be resolved.");

    const merchantReference = `SU20260731153800${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const order = await connection.query<{ id: string }>(
      `insert into payment_orders (
         user_id,
         plan_version_id,
         provider,
         status,
         amount_minor,
         currency,
         idempotency_key,
         merchant_reference,
         checkout_expires_at
       )
       values ($1, $2, 'sandbox', 'pending', 59900, 'PKR', $3, $4, now() + interval '15 minutes')
       returning id`,
      [userId, planVersionId, `smoke-${randomUUID()}`, merchantReference],
    );
    const orderId = order.rows[0]?.id;
    assert(orderId, "The payment order could not be created.");

    await connection.query(
      `insert into payment_events (
         order_id,
         provider,
         provider_event_id,
         event_type,
         provider_status,
         signature_verified,
         payload_digest
       )
       values ($1, 'sandbox', $2, 'status_query', '000', true, $3)`,
      [orderId, `event-${randomUUID()}`, "a".repeat(64)],
    );

    const entitlement = await connection.query<{ id: string }>(
      `insert into entitlements (
         user_id,
         plan_version_id,
         source_order_id,
         status,
         starts_at,
         ends_at
       )
       values ($1, $2, $3, 'active', now(), now() + interval '1 month')
       returning id`,
      [userId, planVersionId, orderId],
    );
    const entitlementId = entitlement.rows[0]?.id;
    assert(entitlementId, "The entitlement could not be created.");

    await connection.query(
      `insert into entitlement_events (
         entitlement_id,
         action,
         actor_type,
         reason,
         previous_status,
         next_status
       )
       values ($1, 'activate', 'system', 'Verified sandbox payment smoke', null, 'active')`,
      [entitlementId],
    );

    const capability = await connection.query<{ capability_count: string }>(
      `select jsonb_array_length(capabilities)::text as capability_count
         from active_user_capabilities
        where user_id = $1`,
      [userId],
    );
    assert(
      Number(capability.rows[0]?.capability_count ?? 0) >= 4,
      "The active entitlement must project server-authoritative capabilities.",
    );

    await connection.query(
      "insert into admin_principals (user_id, created_by) values ($1, $1)",
      [userId],
    );
    await connection.query(
      `insert into admin_role_assignments (user_id, role, assigned_by, reason)
       values ($1, 'content_reviewer', $1, 'Synthetic production-readiness smoke')`,
      [userId],
    );

    const generation = await connection.query<{ id: string }>(
      `insert into ai_generation_requests (
         requested_by,
         task,
         target_type,
         locale,
         prompt_version,
         status,
         requested_items,
         correlation_id
       )
       values ($1, 'generate_level', 'level', 'en', 'smoke-v1', 'completed', 1, $2)
       returning id`,
      [userId, `smoke-${randomUUID()}`],
    );
    const generationId = generation.rows[0]?.id;
    assert(generationId, "The AI generation request could not be created.");

    const artifact = await connection.query<{ id: string }>(
      `insert into ai_generated_artifacts (
         request_id,
         artifact_type,
         locale,
         content_digest,
         original_content,
         validation_report,
         quality_score,
         quality_threshold,
         status,
         source_references
       )
       values (
         $1,
         'level',
         'en',
         $2,
         '{"title":"Synthetic reviewed level"}'::jsonb,
         '{"schema":true,"answerConsistency":true,"duplicate":false}'::jsonb,
         92,
         85,
         'in_review',
         '[]'::jsonb
       )
       returning id`,
      [generationId, "b".repeat(64)],
    );
    const artifactId = artifact.rows[0]?.id;
    assert(artifactId, "The AI artifact could not be created.");

    await connection.query(
      `insert into ai_artifact_reviews (
         artifact_id,
         reviewer_user_id,
         decision,
         reason
       )
       values ($1, $2, 'approve', 'Synthetic artifact passed launch smoke checks')`,
      [artifactId, userId],
    );

    await connection.query("savepoint append_only_guard");
    let appendOnlyBlocked = false;
    try {
      await connection.query(
        "update entitlement_events set reason = 'mutated' where entitlement_id = $1",
        [entitlementId],
      );
    } catch {
      appendOnlyBlocked = true;
      await connection.query("rollback to savepoint append_only_guard");
    }
    assert(appendOnlyBlocked, "Entitlement evidence must be append-only.");

    await connection.query("savepoint artifact_guard");
    let originalBlocked = false;
    try {
      await connection.query(
        `update ai_generated_artifacts
            set original_content = '{"title":"mutated"}'::jsonb
          where id = $1`,
        [artifactId],
      );
    } catch {
      originalBlocked = true;
      await connection.query("rollback to savepoint artifact_guard");
    }
    assert(originalBlocked, "Original AI output must remain immutable.");

    await connection.query("rollback");
    console.log(
      "SkillUp launch operations smoke passed (plans, orders, entitlements, admin audit boundary and AI review immutability verified).",
    );
  } finally {
    connection.release();
  }
} finally {
  await client.close();
}
