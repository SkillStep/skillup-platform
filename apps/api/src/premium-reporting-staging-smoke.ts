import { createDatabaseClient } from "@skillup/database";

import { createAdminService } from "./admin.js";
import { createPremiumReportingService } from "./premium-reporting-service.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is required for Premium reporting smoke.");

const database = createDatabaseClient({
  connectionString,
  applicationName: "skillup-premium-reporting-smoke",
  maxConnections: 2,
});

const now = new Date("2026-08-03T04:00:00.000Z");
const adminService = createAdminService({
  pool: database.pool,
  releaseSha: "premium-reporting-smoke",
  now: () => now,
});
const reporting = createPremiumReportingService({
  pool: database.pool,
  adminService,
  now: () => now,
});

async function run(): Promise<void> {
  const suffix = Math.random().toString(16).slice(2, 10);
  const users = {
    activation: `f1000000-0000-4000-8000-${suffix.padEnd(12, "0")}`,
    renewal: `f2000000-0000-4000-8000-${suffix.padEnd(12, "1")}`,
    manual: `f3000000-0000-4000-8000-${suffix.padEnd(12, "2")}`,
  };

  const connection = await database.pool.connect();
  try {
    await connection.query("begin");
    for (const userId of Object.values(users)) {
      await connection.query(
        `insert into users (id, status, created_at, updated_at)
         values ($1, 'active', $2, $2)
         on conflict (id) do nothing`,
        [userId, new Date("2026-07-01T00:00:00.000Z")],
      );
      await connection.query(
        `insert into learner_profiles
          (user_id, locale, age_band, onboarding_status, created_at, updated_at)
         values ($1, 'en', '18_24', 'completed', $2, $2)
         on conflict (user_id) do nothing`,
        [userId, new Date("2026-07-01T00:00:00.000Z")],
      );
    }

    const plan = await connection.query<{ id: string }>(
      `select plan_version_id as id
         from active_commercial_plan_catalog
        where code = 'premium-monthly'`,
    );
    const planVersionId = plan.rows[0]?.id;
    if (!planVersionId) throw new Error("The Premium monthly plan seed is missing.");

    const insertOrder = async (
      userId: string,
      reference: string,
      status: "succeeded" | "failed" | "pending" | "refunded",
      createdAt: Date,
    ): Promise<string> => {
      const result = await connection.query<{ id: string }>(
        `insert into payment_orders
          (user_id, plan_version_id, provider, status, amount_minor, currency,
           idempotency_key, merchant_reference, checkout_expires_at, completed_at,
           created_at, updated_at)
         values ($1, $2, 'sandbox', $3, 59900, 'PKR', $4, $5,
                 $6 + interval '30 minutes',
                 case when $3 in ('succeeded','refunded') then $6 else null end,
                 $6, $6)
         returning id`,
        [
          userId,
          planVersionId,
          status,
          `premium-smoke-${reference}-${suffix}`,
          `SU20260803${reference.padStart(6, "0")}${suffix.toUpperCase().slice(0, 8)}`.slice(0, 24),
          createdAt,
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error("A Premium smoke payment order was not created.");
      return id;
    };

    const activationOrder = await insertOrder(
      users.activation,
      "100001",
      "succeeded",
      new Date("2026-08-01T05:00:00.000Z"),
    );
    await connection.query(
      `insert into entitlements
        (user_id, plan_version_id, source_order_id, status, starts_at, ends_at, created_at, updated_at)
       values ($1, $2, $3, 'active', $4, $4 + interval '1 month', $4, $4)`,
      [users.activation, planVersionId, activationOrder, new Date("2026-08-01T05:00:00.000Z")],
    );

    const firstRenewalOrder = await insertOrder(
      users.renewal,
      "100002",
      "succeeded",
      new Date("2026-06-01T05:00:00.000Z"),
    );
    await connection.query(
      `insert into entitlements
        (user_id, plan_version_id, source_order_id, status, starts_at, ends_at, created_at, updated_at)
       values ($1, $2, $3, 'expired', $4, $4 + interval '1 month', $4, $4)`,
      [users.renewal, planVersionId, firstRenewalOrder, new Date("2026-06-01T05:00:00.000Z")],
    );
    const renewalOrder = await insertOrder(
      users.renewal,
      "100003",
      "succeeded",
      new Date("2026-07-01T05:00:00.000Z"),
    );
    await connection.query(
      `insert into entitlements
        (user_id, plan_version_id, source_order_id, status, starts_at, ends_at, created_at, updated_at)
       values ($1, $2, $3, 'active', $4, $4 + interval '1 month', $4, $4)`,
      [users.renewal, planVersionId, renewalOrder, new Date("2026-07-01T05:00:00.000Z")],
    );
    await insertOrder(users.renewal, "100004", "failed", new Date("2026-08-02T05:00:00.000Z"));

    await connection.query(
      `insert into entitlements
        (user_id, plan_version_id, source_order_id, status, starts_at, ends_at, created_at, updated_at)
       values ($1, $2, null, 'active', $3, $3 + interval '14 days', $3, $3)`,
      [users.manual, planVersionId, new Date("2026-08-02T06:00:00.000Z")],
    );

    const pendingOrder = await insertOrder(
      users.activation,
      "100005",
      "pending",
      new Date("2026-08-01T06:00:00.000Z"),
    );
    await connection.query(
      `insert into reconciliation_cases
        (order_id, mismatch_kind, status, provider_evidence, internal_evidence, created_at)
       values ($1, 'missing_provider', 'open', '{}'::jsonb,
               '{"reason":"premium smoke stale pending"}'::jsonb, $2)`,
      [pendingOrder, new Date("2026-08-01T07:00:00.000Z")],
    );

    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }

  const filters = {
    preset: "custom" as const,
    from: "2026-06-01T00:00:00.000Z",
    to: "2026-08-04T00:00:00.000Z",
    aggregation: "daily" as const,
  };
  const summary = await reporting.summary(filters);
  const summaryValues = summary["summary"] as Record<string, unknown>;
  if (Number(summaryValues["newPaidActivations"] ?? 0) < 1) {
    throw new Error("Premium activation reporting fixture was not counted.");
  }
  if (Number(summaryValues["successfulRenewals"] ?? 0) < 1) {
    throw new Error("Premium renewal reporting fixture was not counted.");
  }
  if (Number(summaryValues["manualGrants"] ?? 0) < 1) {
    throw new Error("Manual-grant reporting fixture was not counted.");
  }
  if (Number(summaryValues["recurringCustomers"] ?? 0) < 1) {
    throw new Error("Recurring-customer reporting fixture was not counted.");
  }

  const memberships = await reporting.memberships({ ...filters, limit: 100, offset: 0 });
  const membershipItems = memberships["items"] as readonly Record<string, unknown>[];
  if (!membershipItems.some((item) => item["origin"] === "manual_grant")) {
    throw new Error("Manual grants are not distinguishable in the membership ledger.");
  }

  const reconciliation = await reporting.reconciliation({
    ...filters,
    reconciliationStatus: "open",
    limit: 100,
    offset: 0,
  });
  if (Number(reconciliation["total"] ?? 0) < 1) {
    throw new Error("The Premium reconciliation fixture was not reported.");
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "ok",
      summary: summaryValues,
      membershipRows: membershipItems.length,
      reconciliationRows: reconciliation["total"],
    })}\n`,
  );
}

try {
  await run();
} finally {
  await database.close();
}
