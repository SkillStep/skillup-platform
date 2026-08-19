import type { DatabaseClient } from "@skillup/database";

import {
  PREMIUM_REPORT_SCHEMA_VERSION,
  PREMIUM_REPORT_TIMEZONE,
  type PremiumLedgerQuery,
  type PremiumReconciliationQuery,
  type PremiumReportQuery,
  metricDefinitions,
  resolvePremiumReportRange,
} from "./premium-reporting-contract.js";

export type PremiumQueryResult = Readonly<Record<string, unknown>>;

export type PremiumQueryService = Readonly<{
  summary: (query: PremiumReportQuery) => Promise<PremiumQueryResult>;
  payments: (query: PremiumLedgerQuery) => Promise<PremiumQueryResult>;
  memberships: (query: PremiumLedgerQuery) => Promise<PremiumQueryResult>;
  recurringCustomers: (query: PremiumLedgerQuery) => Promise<PremiumQueryResult>;
  reconciliation: (query: PremiumReconciliationQuery) => Promise<PremiumQueryResult>;
  plans: () => Promise<PremiumQueryResult>;
}>;

type FilterValues = readonly [
  Date,
  Date,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
];

function filterValues(query: PremiumReportQuery): FilterValues {
  const range = resolvePremiumReportRange(query);
  return [
    range.from,
    range.to,
    query.planCode ?? null,
    query.planVersionId ?? null,
    query.paymentPurpose ?? null,
    query.paymentStatus ?? null,
    query.membershipStatus ?? null,
  ];
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 100;
}

function envelope(query: PremiumReportQuery): Readonly<Record<string, unknown>> {
  const range = resolvePremiumReportRange(query);
  return {
    reportSchemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
    timezone: PREMIUM_REPORT_TIMEZONE,
    effectiveRange: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      preset: range.preset,
    },
    aggregation: range.aggregation,
    metricDefinitions: metricDefinitions(),
  };
}

const orderFilters = `
  and ($3::text is null or p.code = $3)
  and ($4::uuid is null or o.plan_version_id = $4)
  and ($5::text is null or o.payment_purpose = $5)
  and ($6::text is null or o.status = $6)`;

const membershipFilters = `
  and ($3::text is null or p.code = $3)
  and ($4::uuid is null or mp.plan_version_id = $4)
  and ($5::text is null or mp.purpose = $5)
  and ($6::text is null or mp.status = $6)`;

const reconciliationOrderFilters = `
  and ($2::text is null or p.code = $2)
  and ($3::uuid is null or o.plan_version_id = $3)
  and ($4::text is null or o.payment_purpose = $4)
  and ($5::text is null or o.status = $5)`;

export function createPremiumQueryService(pool: DatabaseClient["pool"]): PremiumQueryService {
  return {
    summary: async (query) => {
      const range = resolvePremiumReportRange(query);
      const values = filterValues(query);
      const orderValues = values.slice(0, 6);
      const membershipValues = [values[0], values[1], values[2], values[3], values[4], values[6]];
      const reconciliationValues = [values[1], values[2], values[3], values[4], values[5]];
      const [financial, attempts, memberships, buckets, planBreakdown, reconciliation] =
        await Promise.all([
          pool.query<Record<string, unknown>>(
            `select
               coalesce(sum(f.amount_minor) filter (
                 where f.effect_type = 'capture' and f.status = 'completed'
               ), 0)::bigint as "grossCollectionsMinor",
               coalesce(sum(f.amount_minor) filter (
                 where f.effect_type in ('refund','reversal') and f.status = 'completed'
               ), 0)::bigint as "refundsMinor",
               count(*) filter (
                 where f.effect_type = 'capture' and f.status = 'completed'
               )::integer as "completedPayments"
             from payment_financial_effects f
             join payment_orders o on o.id = f.order_id
             join commercial_plan_versions v on v.id = o.plan_version_id
             join commercial_plans p on p.id = v.plan_id
            where f.occurred_at >= $1 and f.occurred_at < $2
              ${orderFilters}`,
            orderValues,
          ),
          pool.query<Record<string, unknown>>(
            `select
               count(*) filter (where o.status = 'created')::integer as "createdAttempts",
               count(*) filter (where o.status = 'pending')::integer as "pendingAttempts",
               count(*) filter (where o.status = 'failed')::integer as "failedAttempts",
               count(*) filter (where o.status = 'cancelled')::integer as "cancelledAttempts",
               count(*) filter (where o.status = 'expired')::integer as "expiredAttempts",
               count(*) filter (where o.status = 'refunded')::integer as "refundedOrders",
               count(*) filter (
                 where o.payment_purpose = 'renewal' and o.status = 'failed'
               )::integer as "failedRenewals",
               count(*) filter (
                 where o.status in ('succeeded','failed','cancelled','expired','refunded')
               )::integer as "terminalAttempts",
               count(*) filter (
                 where o.payment_purpose = 'renewal'
                   and o.status in ('succeeded','failed','cancelled','expired','refunded')
               )::integer as "terminalRenewalAttempts"
             from payment_orders o
             join commercial_plan_versions v on v.id = o.plan_version_id
             join commercial_plans p on p.id = v.plan_id
            where o.created_at >= $1 and o.created_at < $2
              ${orderFilters}`,
            orderValues,
          ),
          pool.query<Record<string, unknown>>(
            `select
               count(*) filter (
                 where mp.origin = 'paid' and mp.purpose = 'activation'
                   and mp.period_start >= $1 and mp.period_start < $2
               )::integer as "newPaidActivations",
               count(*) filter (
                 where mp.origin = 'paid' and mp.purpose = 'renewal'
                   and mp.period_start >= $1 and mp.period_start < $2
               )::integer as "successfulRenewals",
               count(*) filter (
                 where mp.origin = 'paid' and mp.purpose = 'reactivation'
                   and mp.period_start >= $1 and mp.period_start < $2
               )::integer as "reactivations",
               count(*) filter (
                 where mp.origin = 'manual_grant'
                   and mp.period_start >= $1 and mp.period_start < $2
               )::integer as "manualGrants",
               count(*) filter (
                 where mp.status = 'active' and mp.period_start < $2 and mp.period_end >= $2
               )::integer as "activeMemberships",
               count(*) filter (
                 where mp.status = 'grace' and mp.period_start < $2
                   and coalesce(mp.grace_end, mp.period_end) >= $2
               )::integer as "graceMemberships",
               count(*) filter (where mp.status = 'cancelled')::integer as "cancelledMemberships",
               count(*) filter (where mp.status = 'expired')::integer as "expiredMemberships",
               count(*) filter (where mp.status = 'refunded')::integer as "refundedMemberships",
               count(*) filter (where mp.status = 'revoked')::integer as "revokedMemberships",
               count(*) filter (
                 where mp.origin = 'paid' and mp.status = 'active'
                   and mp.renewal_due_at >= $2
                   and mp.renewal_due_at < $2 + interval '7 days'
               )::integer as "approachingRenewal",
               count(distinct mp.user_id) filter (
                 where mp.origin = 'paid' and mp.purpose = 'renewal' and mp.period_start < $2
               )::integer as "recurringCustomers",
               coalesce(sum(
                 case
                   when mp.origin <> 'paid' then 0
                   when mp.status not in ('active','grace') then 0
                   when mp.period_start >= $2 then 0
                   when coalesce(mp.grace_end, mp.period_end) < $2 then 0
                   when v.billing_period = 'month' then v.amount_minor
                   when v.billing_period = 'year' then v.amount_minor::numeric / 12
                   else 0
                 end
               ), 0)::numeric(18,2) as "mrrMinor"
             from membership_periods mp
             join commercial_plan_versions v on v.id = mp.plan_version_id
             join commercial_plans p on p.id = v.plan_id
            where true
              ${membershipFilters}`,
            membershipValues,
          ),
          pool.query<Record<string, unknown>>(
            `select
               case when $7::text = 'monthly'
                 then to_char(date_trunc('month', f.occurred_at at time zone 'Asia/Karachi'), 'YYYY-MM')
                 else to_char(date_trunc('day', f.occurred_at at time zone 'Asia/Karachi'), 'YYYY-MM-DD')
               end as bucket,
               coalesce(sum(f.amount_minor) filter (
                 where f.effect_type = 'capture' and f.status = 'completed'
               ), 0)::bigint as "grossMinor",
               coalesce(sum(f.amount_minor) filter (
                 where f.effect_type in ('refund','reversal') and f.status = 'completed'
               ), 0)::bigint as "refundMinor"
             from payment_financial_effects f
             join payment_orders o on o.id = f.order_id
             join commercial_plan_versions v on v.id = o.plan_version_id
             join commercial_plans p on p.id = v.plan_id
            where f.occurred_at >= $1 and f.occurred_at < $2
              ${orderFilters}
            group by bucket
            order by bucket`,
            [...orderValues, range.aggregation],
          ),
          pool.query<Record<string, unknown>>(
            `select p.code as "planCode", p.name as "planName", v.version,
                    v.amount_minor as "planAmountMinor", v.billing_period as "billingPeriod",
                    coalesce(sum(f.amount_minor) filter (
                      where f.effect_type = 'capture' and f.status = 'completed'
                    ), 0)::bigint as "grossMinor",
                    coalesce(sum(f.amount_minor) filter (
                      where f.effect_type in ('refund','reversal') and f.status = 'completed'
                    ), 0)::bigint as "refundMinor"
               from commercial_plans p
               join commercial_plan_versions v on v.plan_id = p.id
               left join payment_orders o on o.plan_version_id = v.id
               left join payment_financial_effects f
                 on f.order_id = o.id and f.occurred_at >= $1 and f.occurred_at < $2
              where ($3::text is null or p.code = $3)
                and ($4::uuid is null or v.id = $4)
              group by p.code, p.name, v.id, v.version, v.amount_minor, v.billing_period
              order by p.code, v.version`,
            values.slice(0, 4),
          ),
          pool.query<Record<string, unknown>>(
            `select count(*) filter (where c.status = 'open')::integer as "openReconciliationCases"
               from reconciliation_cases c
               join payment_orders o on o.id = c.order_id
               join commercial_plan_versions v on v.id = o.plan_version_id
               join commercial_plans p on p.id = v.plan_id
              where c.created_at < $1
                ${reconciliationOrderFilters}`,
            reconciliationValues,
          ),
        ]);

      const financialRow = financial.rows[0] ?? {};
      const attemptRow = attempts.rows[0] ?? {};
      const membershipRow = memberships.rows[0] ?? {};
      const reconciliationRow = reconciliation.rows[0] ?? {};
      const gross = asNumber(financialRow["grossCollectionsMinor"]);
      const refunds = asNumber(financialRow["refundsMinor"]);
      const completed = asNumber(financialRow["completedPayments"]);
      const terminal = asNumber(attemptRow["terminalAttempts"]);
      const successfulRenewals = asNumber(membershipRow["successfulRenewals"]);
      const terminalRenewals = asNumber(attemptRow["terminalRenewalAttempts"]);
      const mrr = Math.round(asNumber(membershipRow["mrrMinor"]));

      return {
        ...envelope(query),
        generatedAt: new Date().toISOString(),
        currency: "PKR",
        summary: {
          grossCollectionsMinor: gross,
          refundsMinor: refunds,
          netCollectionsMinor: gross - refunds,
          cashCollectionsMinor: gross,
          completedPayments: completed,
          createdAttempts: asNumber(attemptRow["createdAttempts"]),
          pendingAttempts: asNumber(attemptRow["pendingAttempts"]),
          failedAttempts: asNumber(attemptRow["failedAttempts"]),
          cancelledAttempts: asNumber(attemptRow["cancelledAttempts"]),
          expiredAttempts: asNumber(attemptRow["expiredAttempts"]),
          refundedOrders: asNumber(attemptRow["refundedOrders"]),
          paymentSuccessRate: rate(completed, terminal),
          newPaidActivations: asNumber(membershipRow["newPaidActivations"]),
          successfulRenewals,
          failedRenewals: asNumber(attemptRow["failedRenewals"]),
          renewalSuccessRate: rate(successfulRenewals, terminalRenewals),
          reactivations: asNumber(membershipRow["reactivations"]),
          manualGrants: asNumber(membershipRow["manualGrants"]),
          activeMemberships: asNumber(membershipRow["activeMemberships"]),
          graceMemberships: asNumber(membershipRow["graceMemberships"]),
          cancelledMemberships: asNumber(membershipRow["cancelledMemberships"]),
          expiredMemberships: asNumber(membershipRow["expiredMemberships"]),
          refundedMemberships: asNumber(membershipRow["refundedMemberships"]),
          revokedMemberships: asNumber(membershipRow["revokedMemberships"]),
          approachingRenewal: asNumber(membershipRow["approachingRenewal"]),
          recurringCustomers: asNumber(membershipRow["recurringCustomers"]),
          mrrMinor: mrr,
          arrMinor: mrr * 12,
          autoRenewUsers: null,
          autoRenewStatus: "not_applicable",
          benefitCostMinor: null,
          benefitCostStatus: "not_applicable",
          openReconciliationCases: asNumber(reconciliationRow["openReconciliationCases"]),
        },
        buckets: buckets.rows.map((row) => {
          const bucketGross = asNumber(row["grossMinor"]);
          const bucketRefund = asNumber(row["refundMinor"]);
          return {
            bucket: asText(row["bucket"]),
            grossMinor: bucketGross,
            refundMinor: bucketRefund,
            netMinor: bucketGross - bucketRefund,
          };
        }),
        planBreakdown: planBreakdown.rows.map((row) => {
          const planGross = asNumber(row["grossMinor"]);
          const planRefund = asNumber(row["refundMinor"]);
          return {
            planCode: row["planCode"],
            planName: row["planName"],
            version: asNumber(row["version"]),
            planAmountMinor: asNumber(row["planAmountMinor"]),
            billingPeriod: row["billingPeriod"],
            grossMinor: planGross,
            refundMinor: planRefund,
            netMinor: planGross - planRefund,
          };
        }),
      };
    },

    payments: async (query) => {
      const values = filterValues(query).slice(0, 6);
      const result = await pool.query<Record<string, unknown>>(
        `select count(*) over()::integer as "totalCount",
                o.id,
                substring(o.user_id::text, 1, 8) || '…' || right(o.user_id::text, 4) as "learnerReference",
                p.code as "planCode", p.name as "planName", v.version as "planVersion",
                v.amount_minor as "planSnapshotAmountMinor", v.billing_period as "billingPeriod",
                o.payment_purpose as purpose, o.amount_minor as "amountMinor", o.currency,
                o.status as "internalStatus", latest_event.provider_status as "providerStatus",
                o.merchant_reference as "merchantReference", o.provider_reference as "providerReference",
                o.created_at as "initiatedAt", o.completed_at as "completedAt",
                case when o.status = 'failed' then o.updated_at end as "failedAt",
                case when o.status = 'cancelled' then o.updated_at end as "cancelledAt",
                case when o.status = 'expired' then o.updated_at end as "expiredAt",
                refund_effect.occurred_at as "refundedAt",
                o.failure_code as "failureCode", o.failure_message as "attentionReason",
                mp.id as "membershipPeriodId", e.id as "entitlementId",
                coalesce(reconciliation.state, 'none') as "reconciliationState"
           from payment_orders o
           join commercial_plan_versions v on v.id = o.plan_version_id
           join commercial_plans p on p.id = v.plan_id
           left join entitlements e on e.source_order_id = o.id
           left join membership_periods mp on mp.entitlement_id = e.id
           left join lateral (
             select pe.provider_status
               from payment_events pe
              where pe.order_id = o.id
              order by pe.received_at desc, pe.id desc
              limit 1
           ) latest_event on true
           left join payment_financial_effects refund_effect
             on refund_effect.order_id = o.id
            and refund_effect.effect_type in ('refund','reversal')
           left join lateral (
             select case
               when bool_or(c.status = 'open') then 'open'
               when count(*) > 0 then 'resolved'
               else 'none'
             end as state
               from reconciliation_cases c
              where c.order_id = o.id
           ) reconciliation on true
          where o.created_at >= $1 and o.created_at < $2
            ${orderFilters}
            and ($7::text is null or o.id::text = $7 or o.user_id::text = $7
                 or o.merchant_reference ilike '%' || $7 || '%'
                 or coalesce(o.provider_reference, '') ilike '%' || $7 || '%')
          order by o.created_at desc, o.id desc
          limit $8 offset $9`,
        [...values, query.search ?? null, query.limit, query.offset],
      );

      return {
        ...envelope(query),
        total: asNumber(result.rows[0]?.["totalCount"]),
        limit: query.limit,
        offset: query.offset,
        items: result.rows.map((row) => ({
          id: row["id"],
          learnerReference: row["learnerReference"],
          planCode: row["planCode"],
          planName: row["planName"],
          planVersion: asNumber(row["planVersion"]),
          planSnapshotAmountMinor: asNumber(row["planSnapshotAmountMinor"]),
          billingPeriod: row["billingPeriod"],
          purpose: row["purpose"],
          amountMinor: asNumber(row["amountMinor"]),
          currency: row["currency"],
          internalStatus: row["internalStatus"],
          providerStatus: row["providerStatus"],
          merchantReference: row["merchantReference"],
          providerReference: row["providerReference"],
          initiatedAt: asIso(row["initiatedAt"]),
          completedAt: asIso(row["completedAt"]),
          failedAt: asIso(row["failedAt"]),
          cancelledAt: asIso(row["cancelledAt"]),
          expiredAt: asIso(row["expiredAt"]),
          refundedAt: asIso(row["refundedAt"]),
          failureCode: row["failureCode"],
          attentionReason: row["attentionReason"],
          membershipPeriodId: row["membershipPeriodId"],
          entitlementId: row["entitlementId"],
          reconciliationState: row["reconciliationState"],
        })),
      };
    },

    memberships: async (query) => {
      const values = filterValues(query);
      const membershipValues = [values[0], values[1], values[2], values[3], values[4], values[6]];
      const result = await pool.query<Record<string, unknown>>(
        `select count(*) over()::integer as "totalCount",
                mp.id, mp.entitlement_id as "entitlementId",
                substring(mp.user_id::text, 1, 8) || '…' || right(mp.user_id::text, 4) as "learnerReference",
                p.code as "planCode", p.name as "planName", v.version as "planVersion",
                v.amount_minor as "planSnapshotAmountMinor", v.billing_period as "billingPeriod",
                mp.status, mp.origin, mp.purpose,
                mp.period_start as "periodStart", mp.period_end as "periodEnd",
                mp.grace_end as "graceEnd", mp.renewal_due_at as "renewalDueAt",
                last_success.occurred_at as "lastSuccessfulPaymentAt",
                last_failure.updated_at as "lastFailedPaymentAt",
                counts.activation_count as "activationCount",
                counts.renewal_count as "renewalCount",
                counts.failed_renewal_count as "failedRenewalCount",
                lifetime.collected_minor as "lifetimeCollectedMinor",
                mp.source_order_id as "sourceOrderId"
           from membership_periods mp
           join commercial_plan_versions v on v.id = mp.plan_version_id
           join commercial_plans p on p.id = v.plan_id
           left join lateral (
             select max(f.occurred_at) as occurred_at
               from payment_financial_effects f
               join payment_orders po on po.id = f.order_id
              where po.user_id = mp.user_id
                and f.effect_type = 'capture' and f.status = 'completed'
           ) last_success on true
           left join lateral (
             select max(po.updated_at) as updated_at
               from payment_orders po
              where po.user_id = mp.user_id and po.status = 'failed'
           ) last_failure on true
           left join lateral (
             select count(*) filter (
                      where x.origin = 'paid' and x.purpose = 'activation'
                    )::integer as activation_count,
                    count(*) filter (
                      where x.origin = 'paid' and x.purpose = 'renewal'
                    )::integer as renewal_count,
                    (select count(*)::integer
                       from payment_orders po
                      where po.user_id = mp.user_id
                        and po.payment_purpose = 'renewal'
                        and po.status = 'failed') as failed_renewal_count
               from membership_periods x
              where x.user_id = mp.user_id
           ) counts on true
           left join lateral (
             select coalesce(sum(
               case when f.effect_type = 'capture' then f.amount_minor else -f.amount_minor end
             ), 0)::bigint as collected_minor
               from payment_financial_effects f
               join payment_orders po on po.id = f.order_id
              where po.user_id = mp.user_id and f.status = 'completed'
           ) lifetime on true
          where mp.period_start < $2 and coalesce(mp.grace_end, mp.period_end) >= $1
            ${membershipFilters}
            and ($7::text is null or mp.id::text = $7
                 or mp.entitlement_id::text = $7 or mp.user_id::text = $7)
          order by mp.period_start desc, mp.id desc
          limit $8 offset $9`,
        [...membershipValues, query.search ?? null, query.limit, query.offset],
      );

      return {
        ...envelope(query),
        total: asNumber(result.rows[0]?.["totalCount"]),
        limit: query.limit,
        offset: query.offset,
        items: result.rows.map((row) => ({
          id: row["id"],
          entitlementId: row["entitlementId"],
          learnerReference: row["learnerReference"],
          planCode: row["planCode"],
          planName: row["planName"],
          planVersion: asNumber(row["planVersion"]),
          planSnapshotAmountMinor: asNumber(row["planSnapshotAmountMinor"]),
          billingPeriod: row["billingPeriod"],
          status: row["status"],
          origin: row["origin"],
          purpose: row["purpose"],
          periodStart: asIso(row["periodStart"]),
          periodEnd: asIso(row["periodEnd"]),
          graceEnd: asIso(row["graceEnd"]),
          renewalDueAt: asIso(row["renewalDueAt"]),
          lastSuccessfulPaymentAt: asIso(row["lastSuccessfulPaymentAt"]),
          lastFailedPaymentAt: asIso(row["lastFailedPaymentAt"]),
          activationCount: asNumber(row["activationCount"]),
          renewalCount: asNumber(row["renewalCount"]),
          failedRenewalCount: asNumber(row["failedRenewalCount"]),
          lifetimeCollectedMinor: asNumber(row["lifetimeCollectedMinor"]),
          sourceOrderId: row["sourceOrderId"],
        })),
      };
    },

    recurringCustomers: async (query) => {
      const values = filterValues(query);
      const recurringValues = [
        values[1],
        values[2],
        values[3],
        values[6],
        query.search ?? null,
        query.limit,
        query.offset,
      ];
      const result = await pool.query<Record<string, unknown>>(
        `with recurring as (
           select mp.user_id,
                  count(*) filter (
                    where mp.purpose = 'renewal' and mp.origin = 'paid'
                  )::integer as renewal_count,
                  max(mp.period_start) filter (
                    where mp.purpose = 'renewal' and mp.origin = 'paid'
                  ) as last_renewal_at,
                  max(mp.renewal_due_at) filter (
                    where mp.status in ('active','grace')
                  ) as next_renewal_at
             from membership_periods mp
            where mp.period_start < $1
            group by mp.user_id
           having count(*) filter (
             where mp.purpose = 'renewal' and mp.origin = 'paid'
           ) > 0
         )
         select count(*) over()::integer as "totalCount",
                substring(r.user_id::text, 1, 8) || '…' || right(r.user_id::text, 4) as "learnerReference",
                current_period.id as "membershipPeriodId", current_period.status,
                current_period.origin, p.code as "planCode", p.name as "planName",
                r.renewal_count as "renewalCount", r.last_renewal_at as "lastRenewalAt",
                r.next_renewal_at as "nextRenewalAt",
                failed.failed_count as "failedRenewalCount",
                lifetime.collected_minor as "lifetimeCollectedMinor"
           from recurring r
           join lateral (
             select mp.*
               from membership_periods mp
              where mp.user_id = r.user_id
              order by mp.period_start desc, mp.id desc
              limit 1
           ) current_period on true
           join commercial_plan_versions v on v.id = current_period.plan_version_id
           join commercial_plans p on p.id = v.plan_id
           left join lateral (
             select count(*)::integer as failed_count
               from payment_orders o
              where o.user_id = r.user_id
                and o.payment_purpose = 'renewal' and o.status = 'failed'
                and o.created_at < $1
           ) failed on true
           left join lateral (
             select coalesce(sum(
               case when f.effect_type = 'capture' then f.amount_minor else -f.amount_minor end
             ), 0)::bigint as collected_minor
               from payment_financial_effects f
               join payment_orders o on o.id = f.order_id
              where o.user_id = r.user_id and f.status = 'completed' and f.occurred_at < $1
           ) lifetime on true
          where ($2::text is null or p.code = $2)
            and ($3::uuid is null or current_period.plan_version_id = $3)
            and ($4::text is null or current_period.status = $4)
            and ($5::text is null or r.user_id::text = $5 or current_period.id::text = $5)
          order by r.last_renewal_at desc, r.user_id
          limit $6 offset $7`,
        recurringValues,
      );

      return {
        ...envelope(query),
        definition: metricDefinitions()["recurringCustomers"],
        autoRenewStatus: "not_applicable",
        total: asNumber(result.rows[0]?.["totalCount"]),
        limit: query.limit,
        offset: query.offset,
        items: result.rows.map((row) => ({
          learnerReference: row["learnerReference"],
          membershipPeriodId: row["membershipPeriodId"],
          status: row["status"],
          origin: row["origin"],
          planCode: row["planCode"],
          planName: row["planName"],
          renewalCount: asNumber(row["renewalCount"]),
          failedRenewalCount: asNumber(row["failedRenewalCount"]),
          lastRenewalAt: asIso(row["lastRenewalAt"]),
          nextRenewalAt: asIso(row["nextRenewalAt"]),
          lifetimeCollectedMinor: asNumber(row["lifetimeCollectedMinor"]),
        })),
      };
    },

    reconciliation: async (query) => {
      const values = filterValues(query);
      const reconciliationValues = [
        values[1],
        values[2],
        values[3],
        values[4],
        values[5],
        query.reconciliationStatus ?? null,
        query.mismatchKind ?? null,
        query.minimumAgeMinutes ?? null,
        query.limit,
        query.offset,
      ];
      const result = await pool.query<Record<string, unknown>>(
        `select count(*) over()::integer as "totalCount",
                c.id, c.status, c.mismatch_kind as "mismatchKind",
                c.provider_evidence as "providerEvidence",
                c.internal_evidence as "internalEvidence",
                c.resolution, c.created_at as "createdAt", c.resolved_at as "resolvedAt",
                extract(epoch from (now() - c.created_at))::bigint as "ageSeconds",
                o.id as "orderId", o.payment_purpose as purpose,
                o.merchant_reference as "merchantReference",
                o.provider_reference as "providerReference",
                o.status as "orderStatus", o.amount_minor as "amountMinor", o.currency,
                p.code as "planCode", p.name as "planName",
                mp.id as "membershipPeriodId", e.id as "entitlementId",
                e.status as "entitlementStatus"
           from reconciliation_cases c
           join payment_orders o on o.id = c.order_id
           join commercial_plan_versions v on v.id = o.plan_version_id
           join commercial_plans p on p.id = v.plan_id
           left join entitlements e on e.source_order_id = o.id
           left join membership_periods mp on mp.entitlement_id = e.id
          where c.created_at < $1
            ${reconciliationOrderFilters}
            and ($6::text is null or c.status = $6)
            and ($7::text is null or c.mismatch_kind = $7)
            and ($8::integer is null or c.created_at <= now() - make_interval(mins => $8))
          order by case when c.status = 'open' then 0 else 1 end, c.created_at, c.id
          limit $9 offset $10`,
        reconciliationValues,
      );

      return {
        ...envelope(query),
        total: asNumber(result.rows[0]?.["totalCount"]),
        limit: query.limit,
        offset: query.offset,
        items: result.rows.map((row) => ({
          id: row["id"],
          status: row["status"],
          mismatchKind: row["mismatchKind"],
          providerEvidence: row["providerEvidence"],
          internalEvidence: row["internalEvidence"],
          resolution: row["resolution"],
          createdAt: asIso(row["createdAt"]),
          resolvedAt: asIso(row["resolvedAt"]),
          ageSeconds: asNumber(row["ageSeconds"]),
          orderId: row["orderId"],
          purpose: row["purpose"],
          merchantReference: row["merchantReference"],
          providerReference: row["providerReference"],
          orderStatus: row["orderStatus"],
          amountMinor: asNumber(row["amountMinor"]),
          currency: row["currency"],
          planCode: row["planCode"],
          planName: row["planName"],
          membershipPeriodId: row["membershipPeriodId"],
          entitlementId: row["entitlementId"],
          entitlementStatus: row["entitlementStatus"],
        })),
      };
    },

    plans: async () => {
      const result = await pool.query<Record<string, unknown>>(
        `select p.id as "planId", p.code as "planCode", p.name as "planName",
                p.status as "planStatus", v.id as "versionId", v.version,
                v.currency, v.amount_minor as "amountMinor",
                v.billing_period as "billingPeriod", v.status as "versionStatus",
                v.capabilities, v.terms_version as "termsVersion",
                v.effective_at as "effectiveAt", v.published_at as "publishedAt",
                v.retired_at as "retiredAt", v.created_at as "createdAt"
           from commercial_plans p
           join commercial_plan_versions v on v.plan_id = p.id
          order by p.code, v.version desc`,
      );
      return {
        reportSchemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
        currency: "PKR",
        featureState: {
          premium: "runtime_configuration",
          jazzCash: "runtime_configuration",
          mutableFromAdmin: false,
        },
        plans: result.rows.map((row) => ({
          planId: row["planId"],
          planCode: row["planCode"],
          planName: row["planName"],
          planStatus: row["planStatus"],
          versionId: row["versionId"],
          version: asNumber(row["version"]),
          currency: row["currency"],
          amountMinor: asNumber(row["amountMinor"]),
          billingPeriod: row["billingPeriod"],
          versionStatus: row["versionStatus"],
          capabilities: row["capabilities"],
          termsVersion: row["termsVersion"],
          effectiveAt: asIso(row["effectiveAt"]),
          publishedAt: asIso(row["publishedAt"]),
          retiredAt: asIso(row["retiredAt"]),
          createdAt: asIso(row["createdAt"]),
        })),
      };
    },
  };
}
