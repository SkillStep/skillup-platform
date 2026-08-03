import { createHash, randomUUID } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { PoolClient } from "pg";

import type { AdminIdentity, AdminService } from "./admin.js";
import {
  PREMIUM_EXPORT_MAX_ROWS,
  PREMIUM_REPORT_SCHEMA_VERSION,
  PREMIUM_REPORT_TIMEZONE,
  type PremiumExportInput,
  type PremiumLedgerQuery,
  type PremiumPlanVersionInput,
  type PremiumReconciliationQuery,
  type PremiumReportQuery,
  metricDefinitions,
  resolvePremiumReportRange,
  rowsToCsv,
} from "./premium-reporting-contract.js";

export type PremiumReportResult = Readonly<Record<string, unknown>>;

export type PremiumReportingService = Readonly<{
  summary: (query: PremiumReportQuery) => Promise<PremiumReportResult>;
  payments: (query: PremiumLedgerQuery) => Promise<PremiumReportResult>;
  memberships: (query: PremiumLedgerQuery) => Promise<PremiumReportResult>;
  recurringCustomers: (query: PremiumLedgerQuery) => Promise<PremiumReportResult>;
  reconciliation: (query: PremiumReconciliationQuery) => Promise<PremiumReportResult>;
  plans: () => Promise<PremiumReportResult>;
  createPlanVersion: (
    actor: AdminIdentity,
    input: PremiumPlanVersionInput,
    correlationId: string,
  ) => Promise<PremiumReportResult>;
  activatePlanVersion: (
    actor: AdminIdentity,
    versionId: string,
    reason: string,
    correlationId: string,
  ) => Promise<PremiumReportResult>;
  retirePlanVersion: (
    actor: AdminIdentity,
    versionId: string,
    reason: string,
    correlationId: string,
  ) => Promise<PremiumReportResult>;
  activateDuePlanVersions: (limit?: number) => Promise<number>;
  createExport: (
    actor: AdminIdentity,
    input: PremiumExportInput,
    correlationId: string,
  ) => Promise<PremiumReportResult>;
  exportHistory: (limit: number) => Promise<PremiumReportResult>;
  downloadExport: (exportId: string) => Promise<Readonly<{ filename: string; contentType: string; payload: Buffer }>>;
}>;

type Queryable = Pick<DatabaseClient["pool"], "query">;

type FilterValues = readonly [
  Date,
  Date,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
];

function reportFilterValues(query: PremiumReportQuery): FilterValues {
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

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function dateValue(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : typeof value === "string" ? value : null;
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 100;
}

function maskedReference(value: unknown): string | null {
  const text = stringValue(value);
  return text ? `${text.slice(0, 8)}…${text.slice(-4)}` : null;
}

function reportEnvelope(query: PremiumReportQuery): Readonly<Record<string, unknown>> {
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

function commonOrderFilters(alias = "o"): string {
  return `
    and ($3::text is null or p.code = $3)
    and ($4::uuid is null or ${alias}.plan_version_id = $4)
    and ($5::text is null or ${alias}.payment_purpose = $5)
    and ($6::text is null or ${alias}.status = $6)`;
}

function commonMembershipFilters(alias = "mp"): string {
  return `
    and ($3::text is null or p.code = $3)
    and ($4::uuid is null or ${alias}.plan_version_id = $4)
    and ($5::text is null or ${alias}.purpose = $5)
    and ($7::text is null or ${alias}.status = $7)`;
}

async function summaryReport(
  pool: DatabaseClient["pool"],
  query: PremiumReportQuery,
): Promise<PremiumReportResult> {
  const range = resolvePremiumReportRange(query);
  const values = reportFilterValues(query);
  const [financial, attempts, memberships, buckets, plans, reconciliation] = await Promise.all([
    pool.query<Record<string, unknown>>(
      `select
         coalesce(sum(f.amount_minor) filter (where f.effect_type = 'capture' and f.status = 'completed'), 0)::bigint as "grossCollectionsMinor",
         coalesce(sum(f.amount_minor) filter (where f.effect_type in ('refund', 'reversal') and f.status = 'completed'), 0)::bigint as "refundsMinor",
         count(*) filter (where f.effect_type = 'capture' and f.status = 'completed')::integer as "completedPayments"
       from payment_financial_effects f
       join payment_orders o on o.id = f.order_id
       join commercial_plan_versions v on v.id = o.plan_version_id
       join commercial_plans p on p.id = v.plan_id
      where f.occurred_at >= $1 and f.occurred_at < $2
        ${commonOrderFilters("o")}`,
      values,
    ),
    pool.query<Record<string, unknown>>(
      `select
         count(*) filter (where o.status = 'created')::integer as "createdAttempts",
         count(*) filter (where o.status = 'pending')::integer as "pendingAttempts",
         count(*) filter (where o.status = 'failed')::integer as "failedAttempts",
         count(*) filter (where o.status = 'cancelled')::integer as "cancelledAttempts",
         count(*) filter (where o.status = 'expired')::integer as "expiredAttempts",
         count(*) filter (where o.status = 'refunded')::integer as "refundedOrders",
         count(*) filter (where o.payment_purpose = 'renewal' and o.status = 'failed')::integer as "failedRenewals",
         count(*) filter (where o.status in ('succeeded','failed','cancelled','expired','refunded'))::integer as "terminalAttempts",
         count(*) filter (where o.payment_purpose = 'renewal' and o.status in ('succeeded','failed','cancelled','expired','refunded'))::integer as "terminalRenewalAttempts"
       from payment_orders o
       join commercial_plan_versions v on v.id = o.plan_version_id
       join commercial_plans p on p.id = v.plan_id
      where o.created_at >= $1 and o.created_at < $2
        ${commonOrderFilters("o")}`,
      values,
    ),
    pool.query<Record<string, unknown>>(
      `select
         count(*) filter (where mp.origin = 'paid' and mp.purpose = 'activation' and mp.period_start >= $1 and mp.period_start < $2)::integer as "newPaidActivations",
         count(*) filter (where mp.origin = 'paid' and mp.purpose = 'renewal' and mp.period_start >= $1 and mp.period_start < $2)::integer as "successfulRenewals",
         count(*) filter (where mp.origin = 'paid' and mp.purpose = 'reactivation' and mp.period_start >= $1 and mp.period_start < $2)::integer as "reactivations",
         count(*) filter (where mp.origin = 'manual_grant' and mp.period_start >= $1 and mp.period_start < $2)::integer as "manualGrants",
         count(*) filter (where mp.status = 'active' and mp.period_start < $2 and mp.period_end >= $2)::integer as "activeMemberships",
         count(*) filter (where mp.status = 'grace' and mp.period_start < $2 and coalesce(mp.grace_end, mp.period_end) >= $2)::integer as "graceMemberships",
         count(*) filter (where mp.status = 'cancelled')::integer as "cancelledMemberships",
         count(*) filter (where mp.status = 'expired')::integer as "expiredMemberships",
         count(*) filter (where mp.status = 'refunded')::integer as "refundedMemberships",
         count(*) filter (where mp.status = 'revoked')::integer as "revokedMemberships",
         count(*) filter (where mp.origin = 'paid' and mp.status = 'active' and mp.renewal_due_at >= $2 and mp.renewal_due_at < $2 + interval '7 days')::integer as "approachingRenewal",
         count(distinct mp.user_id) filter (where mp.origin = 'paid' and mp.purpose = 'renewal' and mp.period_start < $2)::integer as "recurringCustomers",
         coalesce(sum(
           case
             when mp.origin <> 'paid' then 0
             when mp.status not in ('active','grace') then 0
             when mp.period_start >= $2 or coalesce(mp.grace_end, mp.period_end) < $2 then 0
             when v.billing_period = 'month' then v.amount_minor
             when v.billing_period = 'year' then v.amount_minor::numeric / 12
             else 0
           end
         ), 0)::numeric(18,2) as "mrrMinor"
       from membership_periods mp
       join commercial_plan_versions v on v.id = mp.plan_version_id
       join commercial_plans p on p.id = v.plan_id
      where true
        ${commonMembershipFilters("mp")}`,
      values,
    ),
    pool.query<Record<string, unknown>>(
      `select
         case when $8::text = 'monthly'
           then to_char(date_trunc('month', f.occurred_at at time zone 'Asia/Karachi'), 'YYYY-MM')
           else to_char(date_trunc('day', f.occurred_at at time zone 'Asia/Karachi'), 'YYYY-MM-DD')
         end as bucket,
         coalesce(sum(f.amount_minor) filter (where f.effect_type = 'capture' and f.status = 'completed'), 0)::bigint as "grossMinor",
         coalesce(sum(f.amount_minor) filter (where f.effect_type in ('refund','reversal') and f.status = 'completed'), 0)::bigint as "refundMinor"
       from payment_financial_effects f
       join payment_orders o on o.id = f.order_id
       join commercial_plan_versions v on v.id = o.plan_version_id
       join commercial_plans p on p.id = v.plan_id
      where f.occurred_at >= $1 and f.occurred_at < $2
        ${commonOrderFilters("o")}
      group by bucket
      order by bucket`,
      [...values, range.aggregation],
    ),
    pool.query<Record<string, unknown>>(
      `select p.code as "planCode", p.name as "planName", v.version,
              v.amount_minor as "planAmountMinor", v.billing_period as "billingPeriod",
              coalesce(sum(f.amount_minor) filter (where f.effect_type = 'capture' and f.status = 'completed'), 0)::bigint as "grossMinor",
              coalesce(sum(f.amount_minor) filter (where f.effect_type in ('refund','reversal') and f.status = 'completed'), 0)::bigint as "refundMinor"
         from commercial_plans p
         join commercial_plan_versions v on v.plan_id = p.id
         left join payment_orders o on o.plan_version_id = v.id
         left join payment_financial_effects f on f.order_id = o.id and f.occurred_at >= $1 and f.occurred_at < $2
        where ($3::text is null or p.code = $3)
          and ($4::uuid is null or v.id = $4)
        group by p.code, p.name, v.id, v.version, v.amount_minor, v.billing_period
        order by p.code, v.version`,
      values,
    ),
    pool.query<Record<string, unknown>>(
      `select count(*) filter (where c.status = 'open')::integer as "openReconciliationCases"
         from reconciliation_cases c
         join payment_orders o on o.id = c.order_id
         join commercial_plan_versions v on v.id = o.plan_version_id
         join commercial_plans p on p.id = v.plan_id
        where c.created_at < $2
          ${commonOrderFilters("o")}`,
      values,
    ),
  ]);

  const financialRow = financial.rows[0] ?? {};
  const attemptRow = attempts.rows[0] ?? {};
  const membershipRow = memberships.rows[0] ?? {};
  const reconciliationRow = reconciliation.rows[0] ?? {};
  const gross = numberValue(financialRow["grossCollectionsMinor"]);
  const refunds = numberValue(financialRow["refundsMinor"]);
  const completed = numberValue(financialRow["completedPayments"]);
  const terminal = numberValue(attemptRow["terminalAttempts"]);
  const renewals = numberValue(membershipRow["successfulRenewals"]);
  const failedRenewals = numberValue(attemptRow["failedRenewals"]);
  const terminalRenewals = numberValue(attemptRow["terminalRenewalAttempts"]);
  const mrr = Math.round(numberValue(membershipRow["mrrMinor"]));

  return {
    ...reportEnvelope(query),
    generatedAt: new Date().toISOString(),
    currency: "PKR",
    summary: {
      grossCollectionsMinor: gross,
      refundsMinor: refunds,
      netCollectionsMinor: gross - refunds,
      cashCollectionsMinor: gross,
      completedPayments: completed,
      createdAttempts: numberValue(attemptRow["createdAttempts"]),
      pendingAttempts: numberValue(attemptRow["pendingAttempts"]),
      failedAttempts: numberValue(attemptRow["failedAttempts"]),
      cancelledAttempts: numberValue(attemptRow["cancelledAttempts"]),
      expiredAttempts: numberValue(attemptRow["expiredAttempts"]),
      refundedOrders: numberValue(attemptRow["refundedOrders"]),
      paymentSuccessRate: percentage(completed, terminal),
      newPaidActivations: numberValue(membershipRow["newPaidActivations"]),
      successfulRenewals: renewals,
      failedRenewals,
      renewalSuccessRate: percentage(renewals, terminalRenewals),
      reactivations: numberValue(membershipRow["reactivations"]),
      manualGrants: numberValue(membershipRow["manualGrants"]),
      activeMemberships: numberValue(membershipRow["activeMemberships"]),
      graceMemberships: numberValue(membershipRow["graceMemberships"]),
      cancelledMemberships: numberValue(membershipRow["cancelledMemberships"]),
      expiredMemberships: numberValue(membershipRow["expiredMemberships"]),
      refundedMemberships: numberValue(membershipRow["refundedMemberships"]),
      revokedMemberships: numberValue(membershipRow["revokedMemberships"]),
      approachingRenewal: numberValue(membershipRow["approachingRenewal"]),
      recurringCustomers: numberValue(membershipRow["recurringCustomers"]),
      mrrMinor: mrr,
      arrMinor: mrr * 12,
      autoRenewUsers: null,
      autoRenewStatus: "not_applicable",
      benefitCostMinor: null,
      benefitCostStatus: "not_applicable",
      openReconciliationCases: numberValue(reconciliationRow["openReconciliationCases"]),
    },
    buckets: buckets.rows.map((row) => {
      const bucketGross = numberValue(row["grossMinor"]);
      const bucketRefund = numberValue(row["refundMinor"]);
      return {
        bucket: stringValue(row["bucket"]),
        grossMinor: bucketGross,
        refundMinor: bucketRefund,
        netMinor: bucketGross - bucketRefund,
      };
    }),
    planBreakdown: plans.rows.map((row) => {
      const planGross = numberValue(row["grossMinor"]);
      const planRefund = numberValue(row["refundMinor"]);
      return {
        planCode: row["planCode"],
        planName: row["planName"],
        version: numberValue(row["version"]),
        planAmountMinor: numberValue(row["planAmountMinor"]),
        billingPeriod: row["billingPeriod"],
        grossMinor: planGross,
        refundMinor: planRefund,
        netMinor: planGross - planRefund,
      };
    }),
  };
}

async function paymentLedger(
  pool: DatabaseClient["pool"],
  query: PremiumLedgerQuery,
): Promise<PremiumReportResult> {
  const values = reportFilterValues(query);
  const search = query.search ?? null;
  const result = await pool.query<Record<string, unknown>>(
    `select count(*) over()::integer as "totalCount",
            o.id, substring(o.user_id::text, 1, 8) || '…' || right(o.user_id::text, 4) as "learnerReference",
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
            coalesce(rc.status, 'none') as "reconciliationState",
            o.created_at as "stableOrderAt"
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
         on refund_effect.order_id = o.id and refund_effect.effect_type in ('refund','reversal')
       left join lateral (
         select case when bool_or(c.status = 'open') then 'open'
                     when count(*) > 0 then 'resolved'
                     else 'none' end as status
           from reconciliation_cases c
          where c.order_id = o.id
       ) rc on true
      where o.created_at >= $1 and o.created_at < $2
        ${commonOrderFilters("o")}
        and ($8::text is null or o.id::text = $8 or o.user_id::text = $8
             or o.merchant_reference ilike '%' || $8 || '%'
             or coalesce(o.provider_reference, '') ilike '%' || $8 || '%')
      order by o.created_at desc, o.id desc
      limit $9 offset $10`,
    [...values, search, query.limit, query.offset],
  );

  return {
    ...reportEnvelope(query),
    total: numberValue(result.rows[0]?.["totalCount"]),
    limit: query.limit,
    offset: query.offset,
    items: result.rows.map((row) => ({
      id: row["id"],
      learnerReference: row["learnerReference"],
      planCode: row["planCode"],
      planName: row["planName"],
      planVersion: numberValue(row["planVersion"]),
      planSnapshotAmountMinor: numberValue(row["planSnapshotAmountMinor"]),
      billingPeriod: row["billingPeriod"],
      purpose: row["purpose"],
      amountMinor: numberValue(row["amountMinor"]),
      currency: row["currency"],
      internalStatus: row["internalStatus"],
      providerStatus: row["providerStatus"],
      merchantReference: row["merchantReference"],
      providerReference: row["providerReference"],
      initiatedAt: dateValue(row["initiatedAt"]),
      completedAt: dateValue(row["completedAt"]),
      failedAt: dateValue(row["failedAt"]),
      cancelledAt: dateValue(row["cancelledAt"]),
      expiredAt: dateValue(row["expiredAt"]),
      refundedAt: dateValue(row["refundedAt"]),
      failureCode: row["failureCode"],
      attentionReason: row["attentionReason"],
      membershipPeriodId: row["membershipPeriodId"],
      entitlementId: row["entitlementId"],
      reconciliationState: row["reconciliationState"],
    })),
  };
}

async function membershipLedger(
  pool: DatabaseClient["pool"],
  query: PremiumLedgerQuery,
): Promise<PremiumReportResult> {
  const values = reportFilterValues(query);
  const search = query.search ?? null;
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
          where po.user_id = mp.user_id and f.effect_type = 'capture' and f.status = 'completed'
       ) last_success on true
       left join lateral (
         select max(po.updated_at) as updated_at
           from payment_orders po
          where po.user_id = mp.user_id and po.status = 'failed'
       ) last_failure on true
       left join lateral (
         select count(*) filter (where x.origin = 'paid' and x.purpose = 'activation')::integer as activation_count,
                count(*) filter (where x.origin = 'paid' and x.purpose = 'renewal')::integer as renewal_count,
                (select count(*)::integer from payment_orders po where po.user_id = mp.user_id and po.payment_purpose = 'renewal' and po.status = 'failed') as failed_renewal_count
           from membership_periods x
          where x.user_id = mp.user_id
       ) counts on true
       left join lateral (
         select coalesce(sum(case when f.effect_type = 'capture' then f.amount_minor else -f.amount_minor end), 0)::bigint as collected_minor
           from payment_financial_effects f
           join payment_orders po on po.id = f.order_id
          where po.user_id = mp.user_id and f.status = 'completed'
       ) lifetime on true
      where mp.period_start < $2 and coalesce(mp.grace_end, mp.period_end) >= $1
        ${commonMembershipFilters("mp")}
        and ($8::text is null or mp.id::text = $8 or mp.entitlement_id::text = $8 or mp.user_id::text = $8)
      order by mp.period_start desc, mp.id desc
      limit $9 offset $10`,
    [...values, search, query.limit, query.offset],
  );

  return {
    ...reportEnvelope(query),
    total: numberValue(result.rows[0]?.["totalCount"]),
    limit: query.limit,
    offset: query.offset,
    items: result.rows.map((row) => ({
      id: row["id"],
      entitlementId: row["entitlementId"],
      learnerReference: row["learnerReference"],
      planCode: row["planCode"],
      planName: row["planName"],
      planVersion: numberValue(row["planVersion"]),
      planSnapshotAmountMinor: numberValue(row["planSnapshotAmountMinor"]),
      billingPeriod: row["billingPeriod"],
      status: row["status"],
      origin: row["origin"],
      purpose: row["purpose"],
      periodStart: dateValue(row["periodStart"]),
      periodEnd: dateValue(row["periodEnd"]),
      graceEnd: dateValue(row["graceEnd"]),
      renewalDueAt: dateValue(row["renewalDueAt"]),
      lastSuccessfulPaymentAt: dateValue(row["lastSuccessfulPaymentAt"]),
      lastFailedPaymentAt: dateValue(row["lastFailedPaymentAt"]),
      activationCount: numberValue(row["activationCount"]),
      renewalCount: numberValue(row["renewalCount"]),
      failedRenewalCount: numberValue(row["failedRenewalCount"]),
      lifetimeCollectedMinor: numberValue(row["lifetimeCollectedMinor"]),
      sourceOrderId: row["sourceOrderId"],
    })),
  };
}

async function recurringCustomerLedger(
  pool: DatabaseClient["pool"],
  query: PremiumLedgerQuery,
): Promise<PremiumReportResult> {
  const values = reportFilterValues(query);
  const search = query.search ?? null;
  const result = await pool.query<Record<string, unknown>>(
    `with recurring as (
       select mp.user_id,
              count(*) filter (where mp.purpose = 'renewal' and mp.origin = 'paid')::integer as renewal_count,
              max(mp.period_start) filter (where mp.purpose = 'renewal' and mp.origin = 'paid') as last_renewal_at,
              max(mp.renewal_due_at) filter (where mp.status in ('active','grace')) as next_renewal_at,
              count(*) filter (where mp.purpose = 'renewal' and mp.origin = 'paid') > 0 as is_recurring
         from membership_periods mp
        where mp.period_start < $2
        group by mp.user_id
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
         select mp.* from membership_periods mp
          where mp.user_id = r.user_id
          order by mp.period_start desc, mp.id desc limit 1
       ) current_period on true
       join commercial_plan_versions v on v.id = current_period.plan_version_id
       join commercial_plans p on p.id = v.plan_id
       left join lateral (
         select count(*)::integer as failed_count from payment_orders o
          where o.user_id = r.user_id and o.payment_purpose = 'renewal' and o.status = 'failed'
            and o.created_at < $2
       ) failed on true
       left join lateral (
         select coalesce(sum(case when f.effect_type = 'capture' then f.amount_minor else -f.amount_minor end), 0)::bigint as collected_minor
           from payment_financial_effects f
           join payment_orders o on o.id = f.order_id
          where o.user_id = r.user_id and f.status = 'completed' and f.occurred_at < $2
       ) lifetime on true
      where r.is_recurring
        and ($3::text is null or p.code = $3)
        and ($4::uuid is null or current_period.plan_version_id = $4)
        and ($7::text is null or current_period.status = $7)
        and ($8::text is null or r.user_id::text = $8 or current_period.id::text = $8)
      order by r.last_renewal_at desc, r.user_id
      limit $9 offset $10`,
    [...values, search, query.limit, query.offset],
  );

  return {
    ...reportEnvelope(query),
    definition: metricDefinitions()["recurringCustomers"],
    autoRenewStatus: "not_applicable",
    total: numberValue(result.rows[0]?.["totalCount"]),
    limit: query.limit,
    offset: query.offset,
    items: result.rows.map((row) => ({
      learnerReference: row["learnerReference"],
      membershipPeriodId: row["membershipPeriodId"],
      status: row["status"],
      origin: row["origin"],
      planCode: row["planCode"],
      planName: row["planName"],
      renewalCount: numberValue(row["renewalCount"]),
      failedRenewalCount: numberValue(row["failedRenewalCount"]),
      lastRenewalAt: dateValue(row["lastRenewalAt"]),
      nextRenewalAt: dateValue(row["nextRenewalAt"]),
      lifetimeCollectedMinor: numberValue(row["lifetimeCollectedMinor"]),
    })),
  };
}

async function reconciliationLedger(
  pool: DatabaseClient["pool"],
  query: PremiumReconciliationQuery,
): Promise<PremiumReportResult> {
  const values = reportFilterValues(query);
  const result = await pool.query<Record<string, unknown>>(
    `select count(*) over()::integer as "totalCount",
            c.id, c.status, c.mismatch_kind as "mismatchKind",
            c.provider_evidence as "providerEvidence", c.internal_evidence as "internalEvidence",
            c.resolution, c.created_at as "createdAt", c.resolved_at as "resolvedAt",
            extract(epoch from (now() - c.created_at))::bigint as "ageSeconds",
            o.id as "orderId", o.payment_purpose as purpose,
            o.merchant_reference as "merchantReference", o.provider_reference as "providerReference",
            o.status as "orderStatus", o.amount_minor as "amountMinor", o.currency,
            p.code as "planCode", p.name as "planName",
            mp.id as "membershipPeriodId", e.id as "entitlementId", e.status as "entitlementStatus"
       from reconciliation_cases c
       join payment_orders o on o.id = c.order_id
       join commercial_plan_versions v on v.id = o.plan_version_id
       join commercial_plans p on p.id = v.plan_id
       left join entitlements e on e.source_order_id = o.id
       left join membership_periods mp on mp.entitlement_id = e.id
      where c.created_at < $2
        ${commonOrderFilters("o")}
        and ($8::text is null or c.status = $8)
        and ($9::text is null or c.mismatch_kind = $9)
        and ($10::integer is null or c.created_at <= now() - make_interval(mins => $10))
      order by case when c.status = 'open' then 0 else 1 end, c.created_at, c.id
      limit $11 offset $12`,
    [
      ...values,
      query.reconciliationStatus ?? null,
      query.mismatchKind ?? null,
      query.minimumAgeMinutes ?? null,
      query.limit,
      query.offset,
    ],
  );

  return {
    ...reportEnvelope(query),
    total: numberValue(result.rows[0]?.["totalCount"]),
    limit: query.limit,
    offset: query.offset,
    items: result.rows.map((row) => ({
      id: row["id"],
      status: row["status"],
      mismatchKind: row["mismatchKind"],
      providerEvidence: row["providerEvidence"],
      internalEvidence: row["internalEvidence"],
      resolution: row["resolution"],
      createdAt: dateValue(row["createdAt"]),
      resolvedAt: dateValue(row["resolvedAt"]),
      ageSeconds: numberValue(row["ageSeconds"]),
      orderId: row["orderId"],
      purpose: row["purpose"],
      merchantReference: row["merchantReference"],
      providerReference: row["providerReference"],
      orderStatus: row["orderStatus"],
      amountMinor: numberValue(row["amountMinor"]),
      currency: row["currency"],
      planCode: row["planCode"],
      planName: row["planName"],
      membershipPeriodId: row["membershipPeriodId"],
      entitlementId: row["entitlementId"],
      entitlementStatus: row["entitlementStatus"],
    })),
  };
}

async function planCatalog(queryable: Queryable): Promise<PremiumReportResult> {
  const result = await queryable.query<Record<string, unknown>>(
    `select p.id as "planId", p.code as "planCode", p.name as "planName", p.status as "planStatus",
            v.id as "versionId", v.version, v.currency, v.amount_minor as "amountMinor",
            v.billing_period as "billingPeriod", v.status as "versionStatus",
            v.capabilities, v.terms_version as "termsVersion",
            v.published_at as "publishedAt", v.retired_at as "retiredAt",
            v.created_at as "createdAt"
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
      version: numberValue(row["version"]),
      currency: row["currency"],
      amountMinor: numberValue(row["amountMinor"]),
      billingPeriod: row["billingPeriod"],
      versionStatus: row["versionStatus"],
      capabilities: row["capabilities"],
      termsVersion: row["termsVersion"],
      publishedAt: dateValue(row["publishedAt"]),
      retiredAt: dateValue(row["retiredAt"]),
      createdAt: dateValue(row["createdAt"]),
    })),
  };
}

async function exportRows(
  service: Pick<PremiumReportingService, "summary" | "payments" | "memberships" | "recurringCustomers" | "reconciliation">,
  input: PremiumExportInput,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  if (input.reportType === "summary") {
    const report = await service.summary(input.filters);
    const summary = report["summary"];
    const buckets = Array.isArray(report["buckets"]) ? report["buckets"] : [];
    return [
      {
        section: "summary",
        ...(summary && typeof summary === "object" && !Array.isArray(summary)
          ? (summary as Record<string, unknown>)
          : {}),
      },
      ...buckets.map((bucket) => ({
        section: "bucket",
        ...(bucket && typeof bucket === "object" && !Array.isArray(bucket)
          ? (bucket as Record<string, unknown>)
          : {}),
      })),
    ];
  }

  const ledgerQuery: PremiumLedgerQuery = {
    ...input.filters,
    limit: PREMIUM_EXPORT_MAX_ROWS,
    offset: 0,
  };
  const report =
    input.reportType === "payments"
      ? await service.payments(ledgerQuery)
      : input.reportType === "memberships"
        ? await service.memberships(ledgerQuery)
        : input.reportType === "recurring_customers"
          ? await service.recurringCustomers(ledgerQuery)
          : await service.reconciliation({ ...ledgerQuery });
  return Array.isArray(report["items"])
    ? (report["items"] as readonly Readonly<Record<string, unknown>>[])
    : [];
}

export function createPremiumReportingService(options: Readonly<{
  pool: DatabaseClient["pool"];
  adminService: AdminService;
  now?: () => Date;
}>): PremiumReportingService {
  const now = options.now ?? (() => new Date());
  const service = {} as PremiumReportingService;

  const implementation: PremiumReportingService = {
    summary: (query) => summaryReport(options.pool, query),
    payments: (query) => paymentLedger(options.pool, query),
    memberships: (query) => membershipLedger(options.pool, query),
    recurringCustomers: (query) => recurringCustomerLedger(options.pool, query),
    reconciliation: (query) => reconciliationLedger(options.pool, query),
    plans: () => planCatalog(options.pool),

    createPlanVersion: async (actor, input, correlationId) =>
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
        if (!planId) throw Object.assign(new Error("The approved Premium plan was not found."), { statusCode: 404 });
        const inserted = await database.query<Record<string, unknown>>(
          `insert into commercial_plan_versions
            (plan_id, version, currency, amount_minor, billing_period, status,
             capabilities, terms_version, published_at, created_at)
           values (
             $1,
             coalesce((select max(version) + 1 from commercial_plan_versions where plan_id = $1), 1),
             $2, $3, $4, 'draft', $5::jsonb, $6, null, $7
           )
           returning id, version, status, amount_minor as "amountMinor",
                     billing_period as "billingPeriod", capabilities,
                     terms_version as "termsVersion", created_at as "createdAt"`,
          [
            planId,
            input.currency,
            input.amountMinor,
            input.billingPeriod,
            JSON.stringify([...new Set(input.capabilities)].sort()),
            input.termsVersion,
            now(),
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
          },
        });
        return row;
      }),

    activatePlanVersion: async (actor, versionId, reason, correlationId) =>
      transaction(options.pool, async (database) => {
        const selected = await database.query<{ plan_id: string; status: string }>(
          `select plan_id, status from commercial_plan_versions where id = $1 for update`,
          [versionId],
        );
        const version = selected.rows[0];
        if (!version) throw Object.assign(new Error("The plan version was not found."), { statusCode: 404 });
        if (version.status === "retired") {
          throw Object.assign(new Error("A retired plan version cannot be reactivated."), { statusCode: 409 });
        }
        const activatedAt = now();
        await database.query(
          `update commercial_plan_versions
              set status = 'retired', retired_at = $2
            where plan_id = $1 and status = 'active' and id <> $3`,
          [version.plan_id, activatedAt, versionId],
        );
        const updated = await database.query<Record<string, unknown>>(
          `update commercial_plan_versions
              set status = 'active', published_at = coalesce(published_at, $2), retired_at = null
            where id = $1
            returning id, version, status, amount_minor as "amountMinor",
                      billing_period as "billingPeriod", published_at as "publishedAt"`,
          [versionId, activatedAt],
        );
        await database.query(
          `update commercial_plans set status = 'active', updated_at = $2 where id = $1`,
          [version.plan_id, activatedAt],
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
        return updated.rows[0] ?? { id: versionId, status: "active" };
      }),

    retirePlanVersion: async (actor, versionId, reason, correlationId) =>
      transaction(options.pool, async (database) => {
        const retiredAt = now();
        const updated = await database.query<Record<string, unknown> & { plan_id?: string }>(
          `update commercial_plan_versions
              set status = 'retired', retired_at = $2,
                  published_at = coalesce(published_at, $2)
            where id = $1 and status <> 'retired'
            returning id, plan_id, version, status, retired_at as "retiredAt"`,
          [versionId, retiredAt],
        );
        const row = updated.rows[0];
        if (!row) throw Object.assign(new Error("An active or draft plan version was not found."), { statusCode: 404 });
        const planId = stringValue(row["plan_id"]);
        if (planId) {
          await database.query(
            `update commercial_plans p
                set status = case when exists (
                  select 1 from commercial_plan_versions v where v.plan_id = p.id and v.status = 'active'
                ) then 'active' else 'retired' end,
                    updated_at = $2
              where p.id = $1`,
            [planId, retiredAt],
          );
        }
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

    activateDuePlanVersions: async (_limit = 20) => 0,

    createExport: async (actor, input, correlationId) => {
      const rows = await exportRows(implementation, input);
      if (rows.length > PREMIUM_EXPORT_MAX_ROWS) {
        throw Object.assign(
          new Error(`The export exceeds ${PREMIUM_EXPORT_MAX_ROWS} rows. Narrow the selected range or filters.`),
          { statusCode: 413 },
        );
      }
      const csv = rowsToCsv(rows);
      const payload = Buffer.from(csv, "utf8");
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + 86_400_000);
      const exportId = randomUUID();
      const digest = createHash("sha256").update(payload).digest("hex");
      const filename = `skillup-premium-${input.reportType}-${createdAt.toISOString().slice(0, 10)}-${exportId.slice(0, 8)}.csv`;
      await transaction(options.pool, async (database) => {
        await database.query(
          `insert into admin_exports
            (id, requested_by, export_type, filters, reason, status, row_count,
             content_digest, schema_version, filename, content_type,
             created_at, completed_at, generated_at, expires_at)
           values ($1, $2, $3, $4::jsonb, $5, 'completed', $6, $7, $8, $9,
                   'text/csv; charset=utf-8', $10, $10, $10, $11)`,
          [
            exportId,
            actor.userId,
            input.reportType,
            JSON.stringify(input.filters),
            input.reason,
            rows.length,
            digest,
            PREMIUM_REPORT_SCHEMA_VERSION,
            filename,
            createdAt,
            expiresAt,
          ],
        );
        await database.query(
          `insert into admin_export_payloads (export_id, payload, expires_at, created_at)
           values ($1, $2, $3, $4)`,
          [exportId, payload, expiresAt, createdAt],
        );
      });
      await options.adminService.audit({
        actorUserId: actor.userId,
        actorRole: actor.roles[0] ?? null,
        action: "premium.report.export",
        targetType: "admin_export",
        targetId: exportId,
        result: "succeeded",
        reason: input.reason,
        correlationId,
        metadata: {
          reportType: input.reportType,
          filters: input.filters,
          rowCount: rows.length,
          schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
          contentDigest: digest,
        },
      });
      return {
        id: exportId,
        reportType: input.reportType,
        status: "completed",
        rowCount: rows.length,
        schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
        filename,
        contentType: "text/csv; charset=utf-8",
        contentDigest: digest,
        generatedAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        downloadPath: `/v1/admin/reports/premium/exports/${exportId}/download`,
      };
    },

    exportHistory: async (limit) => {
      const result = await options.pool.query<Record<string, unknown>>(
        `select e.id, e.export_type as "reportType", e.status, e.row_count as "rowCount",
                e.schema_version as "schemaVersion", e.filename, e.content_type as "contentType",
                e.content_digest as "contentDigest", e.created_at as "createdAt",
                e.generated_at as "generatedAt", e.expires_at as "expiresAt",
                substring(e.requested_by::text, 1, 8) || '…' || right(e.requested_by::text, 4) as "requestedBy"
           from admin_exports e
          where e.export_type in ('summary','payments','memberships','recurring_customers','reconciliation')
          order by e.created_at desc
          limit $1`,
        [Math.max(1, Math.min(limit, 100))],
      );
      return {
        reportSchemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
        exports: result.rows.map((row) => ({
          ...row,
          rowCount: numberValue(row["rowCount"]),
          createdAt: dateValue(row["createdAt"]),
          generatedAt: dateValue(row["generatedAt"]),
          expiresAt: dateValue(row["expiresAt"]),
          downloadPath: `/v1/admin/reports/premium/exports/${String(row["id"])}/download`,
        })),
      };
    },

    downloadExport: async (exportId) => {
      const result = await options.pool.query<{
        filename: string;
        content_type: string;
        payload: Buffer;
        expires_at: Date;
      }>(
        `select e.filename, e.content_type, p.payload, p.expires_at
           from admin_exports e
           join admin_export_payloads p on p.export_id = e.id
          where e.id = $1 and e.status = 'completed'`,
        [exportId],
      );
      const row = result.rows[0];
      if (!row) throw Object.assign(new Error("The report export was not found."), { statusCode: 404 });
      if (row.expires_at <= now()) {
        throw Object.assign(new Error("The report export has expired. Generate it again."), { statusCode: 410 });
      }
      return {
        filename: row.filename,
        contentType: row.content_type,
        payload: row.payload,
      };
    },
  };

  Object.assign(service, implementation);
  return implementation;
}
