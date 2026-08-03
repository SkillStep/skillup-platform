import type { DatabaseClient } from "@skillup/database";
import type { PoolClient } from "pg";

import type { AdminIdentity, AdminService } from "./admin.js";
import type { PremiumPlanVersionInput } from "./premium-reporting-contract.js";

export type PremiumPlanService = Readonly<{
  createVersion: (
    actor: AdminIdentity,
    input: PremiumPlanVersionInput,
    correlationId: string,
  ) => Promise<Readonly<Record<string, unknown>>>;
  activateVersion: (
    actor: AdminIdentity,
    versionId: string,
    reason: string,
    correlationId: string,
  ) => Promise<Readonly<Record<string, unknown>>>;
  retireVersion: (
    actor: AdminIdentity,
    versionId: string,
    reason: string,
    correlationId: string,
  ) => Promise<Readonly<Record<string, unknown>>>;
  activateDueVersions: (limit?: number) => Promise<number>;
}>;

async function transaction<T>(
  pool: DatabaseClient["pool"],
  operation: (database: PoolClient) => Promise<T>,
): Promise<T> {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    const result = await operation(connection);
    await connection.query("commit");
    return result;
  } catch (error) {
    await connection.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

async function activateInTransaction(
  database: PoolClient,
  versionId: string,
  activatedAt: Date,
): Promise<Readonly<Record<string, unknown>>> {
  const selected = await database.query<{ plan_id: string; status: string }>(
    `select plan_id, status
       from commercial_plan_versions
      where id = $1
      for update`,
    [versionId],
  );
  const version = selected.rows[0];
  if (!version) {
    throw Object.assign(new Error("The plan version was not found."), { statusCode: 404 });
  }
  if (version.status === "retired") {
    throw Object.assign(new Error("A retired plan version cannot be reactivated."), {
      statusCode: 409,
    });
  }

  await database.query(
    `update commercial_plan_versions
        set status = 'retired', retired_at = $2,
            published_at = coalesce(published_at, $2),
            effective_at = coalesce(effective_at, published_at, $2)
      where plan_id = $1 and status = 'active' and id <> $3`,
    [version.plan_id, activatedAt, versionId],
  );
  const updated = await database.query<Record<string, unknown>>(
    `update commercial_plan_versions
        set status = 'active',
            effective_at = coalesce(effective_at, $2),
            published_at = coalesce(published_at, $2),
            retired_at = null
      where id = $1
      returning id, plan_id as "planId", version, status,
                amount_minor as "amountMinor", billing_period as "billingPeriod",
                effective_at as "effectiveAt", published_at as "publishedAt"`,
    [versionId, activatedAt],
  );
  await database.query(
    `update commercial_plans
        set status = 'active', updated_at = $2
      where id = $1`,
    [version.plan_id, activatedAt],
  );
  const row = updated.rows[0];
  if (!row) throw new Error("The activated plan version could not be loaded.");
  return row;
}

export function createPremiumPlanService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    adminService: AdminService;
    now?: () => Date;
  }>,
): PremiumPlanService {
  const now = options.now ?? (() => new Date());

  return {
    createVersion: async (actor, input, correlationId) =>
      transaction(options.pool, async (database) => {
        if (
          (input.planCode === "premium-monthly" && input.billingPeriod !== "month") ||
          (input.planCode === "premium-yearly" && input.billingPeriod !== "year")
        ) {
          throw Object.assign(new Error("The billing period does not match the approved plan."), {
            statusCode: 400,
          });
        }
        const plan = await database.query<{ id: string }>(
          `select id from commercial_plans where code = $1 for update`,
          [input.planCode],
        );
        const planId = plan.rows[0]?.id;
        if (!planId) {
          throw Object.assign(new Error("The approved Premium plan was not found."), {
            statusCode: 404,
          });
        }
        const createdAt = now();
        const effectiveAt = input.effectiveAt ? new Date(input.effectiveAt) : null;
        if (effectiveAt && !Number.isFinite(effectiveAt.getTime())) {
          throw Object.assign(new Error("The effective time is invalid."), { statusCode: 400 });
        }
        const inserted = await database.query<Record<string, unknown>>(
          `insert into commercial_plan_versions
            (plan_id, version, currency, amount_minor, billing_period, status,
             capabilities, terms_version, effective_at, published_at, created_at)
           values (
             $1,
             coalesce((select max(version) + 1 from commercial_plan_versions where plan_id = $1), 1),
             $2, $3, $4, 'draft', $5::jsonb, $6, $7, null, $8
           )
           returning id, version, status, amount_minor as "amountMinor",
                     billing_period as "billingPeriod", capabilities,
                     terms_version as "termsVersion", effective_at as "effectiveAt",
                     created_at as "createdAt"`,
          [
            planId,
            input.currency,
            input.amountMinor,
            input.billingPeriod,
            JSON.stringify([...new Set(input.capabilities)].sort()),
            input.termsVersion,
            effectiveAt,
            createdAt,
          ],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("The draft plan version could not be created.");
        await options.adminService.audit({
          actorUserId: actor.userId,
          actorRole: actor.roles[0] ?? null,
          action: "commercial.plan.version.create",
          targetType: "commercial_plan_version",
          targetId: String(row["id"]),
          result: "succeeded",
          reason: input.reason,
          correlationId,
          metadata: {
            planCode: input.planCode,
            amountMinor: input.amountMinor,
            billingPeriod: input.billingPeriod,
            termsVersion: input.termsVersion,
            effectiveAt: input.effectiveAt ?? null,
          },
        });
        return row;
      }),

    activateVersion: async (actor, versionId, reason, correlationId) => {
      const activatedAt = now();
      const row = await transaction(options.pool, (database) =>
        activateInTransaction(database, versionId, activatedAt),
      );
      await options.adminService.audit({
        actorUserId: actor.userId,
        actorRole: actor.roles[0] ?? null,
        action: "commercial.plan.version.activate",
        targetType: "commercial_plan_version",
        targetId: versionId,
        result: "succeeded",
        reason,
        correlationId,
      });
      return row;
    },

    retireVersion: async (actor, versionId, reason, correlationId) =>
      transaction(options.pool, async (database) => {
        const retiredAt = now();
        const updated = await database.query<Record<string, unknown>>(
          `update commercial_plan_versions
              set status = 'retired', retired_at = $2,
                  effective_at = coalesce(effective_at, published_at, $2),
                  published_at = coalesce(published_at, $2)
            where id = $1 and status <> 'retired'
            returning id, plan_id as "planId", version, status,
                      retired_at as "retiredAt"`,
          [versionId, retiredAt],
        );
        const row = updated.rows[0];
        if (!row) {
          throw Object.assign(new Error("An active or draft plan version was not found."), {
            statusCode: 404,
          });
        }
        await database.query(
          `update commercial_plans p
              set status = case when exists (
                select 1 from commercial_plan_versions v
                 where v.plan_id = p.id and v.status = 'active'
              ) then 'active' else 'retired' end,
                  updated_at = $2
            where p.id = $1`,
          [row["planId"], retiredAt],
        );
        await options.adminService.audit({
          actorUserId: actor.userId,
          actorRole: actor.roles[0] ?? null,
          action: "commercial.plan.version.retire",
          targetType: "commercial_plan_version",
          targetId: versionId,
          result: "succeeded",
          reason,
          correlationId,
        });
        return row;
      }),

    activateDueVersions: async (limit = 20) => {
      const safeLimit = Math.max(1, Math.min(limit, 100));
      let activated = 0;
      for (let index = 0; index < safeLimit; index += 1) {
        const result = await transaction(options.pool, async (database) => {
          const selected = await database.query<{ id: string }>(
            `select id
               from commercial_plan_versions
              where status = 'draft'
                and effective_at is not null
                and effective_at <= $1
              order by effective_at, id
              limit 1
              for update skip locked`,
            [now()],
          );
          const versionId = selected.rows[0]?.id;
          if (!versionId) return null;
          return activateInTransaction(database, versionId, now());
        });
        if (!result) break;
        activated += 1;
        await options.adminService.audit({
          actorUserId: null,
          action: "commercial.plan.version.activate_scheduled",
          targetType: "commercial_plan_version",
          targetId: String(result["id"]),
          result: "succeeded",
          reason: "Approved effective time reached.",
          correlationId: `scheduled-plan:${String(result["id"])}`,
          metadata: { effectiveAt: result["effectiveAt"] ?? null },
        });
      }
      return activated;
    },
  };
}
