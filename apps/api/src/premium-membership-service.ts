import type { DatabaseClient } from "@skillup/database";
import type { PoolClient } from "pg";
import { z } from "zod";

import type { AdminIdentity, AdminService } from "./admin.js";

export const ManualGrantInputSchema = z
  .object({
    userId: z.string().uuid(),
    planVersionId: z.string().uuid(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: z.string().trim().min(3).max(500),
    evidenceReference: z.string().trim().min(3).max(500).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Date(value.endsAt) <= new Date(value.startsAt)) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The manual grant end must be after its start.",
      });
    }
    const duration = new Date(value.endsAt).getTime() - new Date(value.startsAt).getTime();
    if (duration > 366 * 86_400_000) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "A manual grant cannot exceed 366 days.",
      });
    }
  });

export type ManualGrantInput = z.infer<typeof ManualGrantInputSchema>;

export type PremiumMembershipService = Readonly<{
  createManualGrant: (
    actor: AdminIdentity,
    input: ManualGrantInput,
    correlationId: string,
  ) => Promise<Readonly<Record<string, unknown>>>;
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

export function createPremiumMembershipService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    adminService: AdminService;
    now?: () => Date;
  }>,
): PremiumMembershipService {
  const now = options.now ?? (() => new Date());

  return {
    createManualGrant: async (actor, input, correlationId) =>
      transaction(options.pool, async (database) => {
        const startsAt = new Date(input.startsAt);
        const endsAt = new Date(input.endsAt);
        const user = await database.query<{ status: string }>(
          `select status from users where id = $1 for update`,
          [input.userId],
        );
        if (!user.rows[0]) {
          throw Object.assign(new Error("The learner was not found."), { statusCode: 404 });
        }
        if (user.rows[0].status !== "active") {
          throw Object.assign(
            new Error("Manual access can only be granted to an active learner."),
            {
              statusCode: 409,
            },
          );
        }

        const plan = await database.query<{ status: string; plan_status: string }>(
          `select v.status, p.status as plan_status
             from commercial_plan_versions v
             join commercial_plans p on p.id = v.plan_id
            where v.id = $1`,
          [input.planVersionId],
        );
        const planRow = plan.rows[0];
        if (!planRow || planRow.status !== "active" || planRow.plan_status !== "active") {
          throw Object.assign(
            new Error("Manual grants require the current active approved plan version."),
            {
              statusCode: 409,
            },
          );
        }

        const overlap = await database.query<{ id: string }>(
          `select id
             from entitlements
            where user_id = $1
              and status in ('active','grace')
              and starts_at < $3
              and coalesce(grace_ends_at, ends_at) > $2
            limit 1
            for update`,
          [input.userId, startsAt, endsAt],
        );
        if (overlap.rows[0]) {
          throw Object.assign(
            new Error("The learner already has an overlapping active or grace entitlement."),
            { statusCode: 409 },
          );
        }

        const createdAt = now();
        const inserted = await database.query<Record<string, unknown>>(
          `insert into entitlements
            (user_id, plan_version_id, source_order_id, status, starts_at, ends_at,
             created_at, updated_at)
           values ($1, $2, null, 'active', $3, $4, $5, $5)
           returning id, user_id as "userId", plan_version_id as "planVersionId",
                     status, starts_at as "startsAt", ends_at as "endsAt"`,
          [input.userId, input.planVersionId, startsAt, endsAt, createdAt],
        );
        const entitlement = inserted.rows[0];
        if (!entitlement) throw new Error("The manual entitlement could not be created.");
        const entitlementId = String(entitlement["id"]);

        await database.query(
          `insert into entitlement_events
            (entitlement_id, action, actor_type, actor_user_id, reason,
             evidence_reference, previous_status, next_status, created_at)
           values ($1, 'activate', 'admin', $2, $3, $4, null, 'active', $5)`,
          [entitlementId, actor.userId, input.reason, input.evidenceReference ?? null, createdAt],
        );
        await options.adminService.audit({
          actorUserId: actor.userId,
          actorRole: actor.roles[0] ?? null,
          action: "subscription.manual_grant.create",
          targetType: "entitlement",
          targetId: entitlementId,
          result: "succeeded",
          reason: input.reason,
          correlationId,
          metadata: {
            userId: input.userId,
            planVersionId: input.planVersionId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            evidenceReference: input.evidenceReference ?? null,
          },
        });
        return {
          ...entitlement,
          origin: "manual_grant",
          purpose: "manual_grant",
        };
      }),
  };
}
