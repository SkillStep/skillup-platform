import type { DatabaseClient } from "@skillup/database";
import { z } from "zod";

import type { AdminIdentity, AdminService } from "./admin.js";
import {
  PremiumPresetSchema,
  type PremiumReportQuery,
  PremiumReportQuerySchema,
  resolvePremiumReportRange,
} from "./premium-reporting-contract.js";

const MatchSchema = z
  .object({
    preset: PremiumPresetSchema.default("last_30_days"),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    aggregation: z.enum(["daily", "monthly"]).default("daily"),
    platform: z.string().trim().min(1).max(80).optional(),
    package: z.string().trim().min(1).max(80).optional(),
    parameter: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const CampaignHygieneInputSchema = z
  .object({
    action: z.enum(["omit", "restore"]),
    reason: z.string().trim().min(3).max(500),
    orderIds: z.array(z.string().uuid()).min(1).max(200).optional(),
    match: MatchSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.orderIds?.length && !value.match) {
      context.addIssue({
        code: "custom",
        message: "Provide orderIds and/or match filters to omit or restore campaign rows.",
      });
    }
    if (value.match?.preset === "custom" && (!value.match.from || !value.match.to)) {
      context.addIssue({
        code: "custom",
        message: "Custom match ranges require both from and to timestamps.",
      });
    }
  });

export type CampaignHygieneInput = z.infer<typeof CampaignHygieneInputSchema>;

export type CampaignHygieneResult = Readonly<{
  action: "omit" | "restore";
  updatedCount: number;
  orderIds: readonly string[];
}>;

export type CampaignOrderRow = Readonly<{
  id: string;
  completedAt: string | null;
  amountMinor: number;
  planCode: string | null;
  platform: string;
  package: string;
  parameter: string;
  omitted: boolean;
  merchantReference: string;
}>;

function requestError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export function isOmittedFromCampaignReport(attribution: unknown): boolean {
  if (attribution === null || attribution === undefined) return false;
  if (typeof attribution !== "object" || Array.isArray(attribution)) return false;
  return (attribution as Record<string, unknown>)["omitFromCampaignReport"] === true;
}

export type PremiumCampaignHygieneService = Readonly<{
  apply: (
    actor: AdminIdentity,
    input: CampaignHygieneInput,
    correlationId: string,
  ) => Promise<CampaignHygieneResult>;
  listOrders: (
    query: PremiumReportQuery & Readonly<{ omitted?: "true" | "false" | "all"; limit?: number }>,
  ) => Promise<Readonly<{ total: number; items: readonly CampaignOrderRow[] }>>;
}>;

export function createPremiumCampaignHygieneService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    adminService: AdminService;
    now?: () => Date;
  }>,
): PremiumCampaignHygieneService {
  const now = options.now ?? (() => new Date());

  return {
    apply: async (actor, input, correlationId) => {
      const omit = input.action === "omit";
      const flagJson = omit ? "true" : "false";
      let updated: { id: string }[] = [];

      if (input.orderIds?.length) {
        const result = await options.pool.query<{ id: string }>(
          `update payment_orders
              set attribution = jsonb_set(
                    coalesce(attribution, '{}'::jsonb),
                    '{omitFromCampaignReport}',
                    to_jsonb($2::boolean),
                    true
                  ),
                  updated_at = now()
            where id = any($1::uuid[])
              and status = 'succeeded'
          returning id`,
          [input.orderIds, omit],
        );
        updated = result.rows;
      }

      if (input.match) {
        const rangeQuery = PremiumReportQuerySchema.parse({
          preset: input.match.preset,
          from: input.match.from,
          to: input.match.to,
          aggregation: input.match.aggregation,
        });
        const range = resolvePremiumReportRange(rangeQuery, now());
        const result = await options.pool.query<{ id: string }>(
          `update payment_orders o
              set attribution = jsonb_set(
                    coalesce(o.attribution, '{}'::jsonb),
                    '{omitFromCampaignReport}',
                    to_jsonb($6::boolean),
                    true
                  ),
                  updated_at = now()
            where o.status = 'succeeded'
              and o.completed_at is not null
              and o.completed_at >= $1
              and o.completed_at < $2
              and (
                $3::text is null
                or coalesce(
                     nullif(btrim(o.attribution->>'utm'), ''),
                     nullif(btrim(o.attribution->>'utm_source'), ''),
                     'none'
                   ) = $3
              )
              and (
                $4::text is null
                or coalesce(nullif(btrim(o.attribution->>'package'), ''), 'none') = $4
              )
              and (
                $5::text is null
                or coalesce(nullif(btrim(o.attribution->>'parameter'), ''), 'none') = $5
              )
          returning o.id`,
          [
            range.from,
            range.to,
            input.match.platform ?? null,
            input.match.package ?? null,
            input.match.parameter ?? null,
            omit,
          ],
        );
        const seen = new Set(updated.map((row) => row.id));
        for (const row of result.rows) {
          if (!seen.has(row.id)) updated.push(row);
        }
      }

      if (updated.length === 0) {
        throw requestError(404, "No succeeded payment orders matched the hygiene request.");
      }

      await options.adminService.audit({
        actorUserId: actor.userId,
        actorRole: actor.roles[0] ?? null,
        action: `premium.campaign_attribution.${input.action}`,
        targetType: "payment_orders",
        targetId: updated[0]!.id,
        result: "succeeded",
        reason: input.reason,
        correlationId,
        metadata: {
          action: input.action,
          flag: flagJson,
          updatedCount: updated.length,
          orderIds: updated.map((row) => row.id).slice(0, 50),
        },
      });

      return {
        action: input.action,
        updatedCount: updated.length,
        orderIds: updated.map((row) => row.id),
      };
    },

    listOrders: async (query) => {
      const range = resolvePremiumReportRange(query, now());
      const omitted = query.omitted ?? "all";
      const limit = Math.max(1, Math.min(query.limit ?? 50, 200));
      const result = await options.pool.query<Record<string, unknown>>(
        `select
           o.id,
           o.completed_at as "completedAt",
           o.amount_minor as "amountMinor",
           o.merchant_reference as "merchantReference",
           p.code as "planCode",
           coalesce(
             nullif(btrim(o.attribution->>'utm'), ''),
             nullif(btrim(o.attribution->>'utm_source'), ''),
             'none'
           ) as platform,
           coalesce(nullif(btrim(o.attribution->>'package'), ''), 'none') as package,
           coalesce(nullif(btrim(o.attribution->>'parameter'), ''), 'none') as parameter,
           coalesce((o.attribution->>'omitFromCampaignReport')::boolean, false) as omitted
         from payment_orders o
         join commercial_plan_versions v on v.id = o.plan_version_id
         join commercial_plans p on p.id = v.plan_id
        where o.status = 'succeeded'
          and o.completed_at is not null
          and o.completed_at >= $1
          and o.completed_at < $2
          and (
            $3::text = 'all'
            or ($3::text = 'true' and coalesce((o.attribution->>'omitFromCampaignReport')::boolean, false) = true)
            or ($3::text = 'false' and coalesce((o.attribution->>'omitFromCampaignReport')::boolean, false) = false)
          )
        order by o.completed_at desc
        limit $4`,
        [range.from, range.to, omitted, limit],
      );

      const count = await options.pool.query<{ total: string }>(
        `select count(*)::text as total
           from payment_orders o
          where o.status = 'succeeded'
            and o.completed_at is not null
            and o.completed_at >= $1
            and o.completed_at < $2
            and (
              $3::text = 'all'
              or ($3::text = 'true' and coalesce((o.attribution->>'omitFromCampaignReport')::boolean, false) = true)
              or ($3::text = 'false' and coalesce((o.attribution->>'omitFromCampaignReport')::boolean, false) = false)
            )`,
        [range.from, range.to, omitted],
      );

      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map((row) => ({
          id: String(row["id"]),
          completedAt:
            row["completedAt"] instanceof Date
              ? row["completedAt"].toISOString()
              : typeof row["completedAt"] === "string"
                ? row["completedAt"]
                : null,
          amountMinor: Number(row["amountMinor"] ?? 0),
          planCode: typeof row["planCode"] === "string" ? row["planCode"] : null,
          platform: String(row["platform"] ?? "none"),
          package: String(row["package"] ?? "none"),
          parameter: String(row["parameter"] ?? "none"),
          omitted: Boolean(row["omitted"]),
          merchantReference: String(row["merchantReference"] ?? ""),
        })),
      };
    },
  };
}
