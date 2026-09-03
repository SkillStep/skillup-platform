import { randomUUID } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { PoolClient } from "pg";

import type { JazzCashCpsClient, JazzCashCpsEvidence } from "./jazzcash-cps.js";

export type CommercialMaintenanceSummary = Readonly<{
  scheduled: Readonly<Record<string, number>>;
  processed: Readonly<Record<string, number>>;
}>;

type JobRow = Readonly<{
  id: string;
  job_type: string;
  order_id: string | null;
  entitlement_id: string | null;
  attempt_count: number;
  lease_token: string;
}>;

type ProviderOrder = Readonly<{
  id: string;
  status: string;
  amount_minor: number;
  currency: "PKR";
  merchant_reference: string;
  provider_reference: string | null;
  user_id: string;
  plan_code: string;
}>;

async function transaction<T>(
  pool: DatabaseClient["pool"],
  operation: (database: PoolClient) => Promise<T>,
): Promise<T> {
  const database = await pool.connect();
  try {
    await database.query("begin");
    const result = await operation(database);
    await database.query("commit");
    return result;
  } catch (error) {
    await database.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    database.release();
  }
}

function count(result: Readonly<{ rowCount: number | null }>): number {
  return result.rowCount ?? 0;
}

function providerEventId(
  operation: "status" | "refund",
  orderId: string,
  evidence: JazzCashCpsEvidence,
): string {
  return `cps:${operation}:${orderId}:${evidence.payloadDigest.slice(0, 24)}`;
}

function providerEvidence(evidence: JazzCashCpsEvidence): Record<string, unknown> {
  return {
    operation: evidence.operation,
    responseCode: evidence.responseCode,
    responseMessage: evidence.responseMessage,
    providerStatus: evidence.providerStatus,
    providerReference: evidence.providerReference,
    signatureVerified: evidence.signatureVerified,
    payloadDigest: evidence.payloadDigest,
    accepted: evidence.accepted,
  };
}

async function loadProviderOrder(
  pool: DatabaseClient["pool"],
  orderId: string,
): Promise<ProviderOrder> {
  const order = await pool.query<ProviderOrder>(
    `select
       o.id,
       o.status,
       o.amount_minor,
       o.currency,
       o.merchant_reference,
       o.provider_reference,
       o.user_id,
       p.code as plan_code
     from payment_orders o
     join commercial_plan_versions v on v.id = o.plan_version_id
     join commercial_plans p on p.id = v.plan_id
     where o.id = $1 and o.provider = 'jazzcash'`,
    [orderId],
  );
  const row = order.rows[0];
  if (!row) throw new Error("The JazzCash provider job references an unknown order.");
  return row;
}

async function completeProviderJob(
  database: PoolClient,
  job: JobRow,
  completedAt: Date,
): Promise<void> {
  await database.query(
    `update commercial_jobs
        set status = 'completed', lease_token = null, lease_expires_at = null,
            last_error = null, updated_at = $2
      where id = $1 and lease_token = $3`,
    [job.id, completedAt, job.lease_token],
  );
}

async function persistStatusInquiry(
  pool: DatabaseClient["pool"],
  job: JobRow,
  order: ProviderOrder,
  evidence: JazzCashCpsEvidence,
  completedAt: Date,
): Promise<void> {
  await transaction(pool, async (database) => {
    const current = await database.query<ProviderOrder>(
      `select
         o.id, o.status, o.amount_minor, o.currency, o.merchant_reference,
         o.provider_reference, o.user_id, p.code as plan_code
       from payment_orders o
       join commercial_plan_versions v on v.id = o.plan_version_id
       join commercial_plans p on p.id = v.plan_id
       where o.id = $1 and o.provider = 'jazzcash'
       for update`,
      [order.id],
    );
    const row = current.rows[0];
    if (!row) throw new Error("The JazzCash order disappeared during status reconciliation.");

    await database.query(
      `insert into payment_events (
         order_id, provider, provider_event_id, event_type, provider_status,
         signature_verified, payload_digest, received_at
       )
       values ($1, 'jazzcash', $2, 'status_query', $3, $4, $5, $6)
       on conflict (provider, provider_event_id) do nothing`,
      [
        order.id,
        providerEventId("status", order.id, evidence),
        evidence.providerStatus ?? evidence.responseCode ?? "unknown",
        evidence.signatureVerified === true,
        evidence.payloadDigest,
        completedAt,
      ],
    );

    if (evidence.providerReference && !row.provider_reference) {
      await database.query(
        "update payment_orders set provider_reference = $2, updated_at = $3 where id = $1",
        [order.id, evidence.providerReference, completedAt],
      );
    }

    if (row.status === "pending") {
      await database.query(
        `insert into reconciliation_cases (
           order_id, mismatch_kind, status, provider_evidence, internal_evidence, created_at
         )
         values ($1, 'status', 'open', $2::jsonb, $3::jsonb, $4)
         on conflict (order_id, mismatch_kind) where status = 'open'
         do update set provider_evidence = excluded.provider_evidence,
                       internal_evidence = excluded.internal_evidence`,
        [
          order.id,
          JSON.stringify(providerEvidence(evidence)),
          JSON.stringify({
            status: row.status,
            amountMinor: row.amount_minor,
            currency: row.currency,
            merchantReference: row.merchant_reference,
          }),
          completedAt,
        ],
      );
    }

    await completeProviderJob(database, job, completedAt);
  });
}

async function persistAcceptedRefund(
  pool: DatabaseClient["pool"],
  job: JobRow,
  order: ProviderOrder,
  evidence: JazzCashCpsEvidence,
  completedAt: Date,
): Promise<void> {
  if (!evidence.accepted) {
    throw new Error(
      `JazzCash CPS refund was not accepted (${evidence.responseCode ?? "unknown response"}).`,
    );
  }

  await transaction(pool, async (database) => {
    const current = await database.query<ProviderOrder>(
      `select
         o.id, o.status, o.amount_minor, o.currency, o.merchant_reference,
         o.provider_reference, o.user_id, p.code as plan_code
       from payment_orders o
       join commercial_plan_versions v on v.id = o.plan_version_id
       join commercial_plans p on p.id = v.plan_id
       where o.id = $1 and o.provider = 'jazzcash'
       for update`,
      [order.id],
    );
    const row = current.rows[0];
    if (!row) throw new Error("The JazzCash order disappeared during refund processing.");

    if (row.status === "refunded") {
      await completeProviderJob(database, job, completedAt);
      return;
    }
    if (row.status !== "succeeded") {
      throw new Error("A JazzCash refund can only settle a previously successful order.");
    }

    await database.query(
      `insert into payment_events (
         order_id, provider, provider_event_id, event_type, provider_status,
         signature_verified, payload_digest, received_at
       )
       values ($1, 'jazzcash', $2, 'refund', $3, $4, $5, $6)
       on conflict (provider, provider_event_id) do nothing`,
      [
        order.id,
        providerEventId("refund", order.id, evidence),
        evidence.providerStatus ?? evidence.responseCode ?? "accepted",
        evidence.signatureVerified === true,
        evidence.payloadDigest,
        completedAt,
      ],
    );

    await database.query(
      `update payment_orders
          set status = 'refunded',
              provider_reference = coalesce($2, provider_reference),
              completed_at = coalesce(completed_at, $3),
              failure_code = null,
              failure_message = null,
              updated_at = $3
        where id = $1`,
      [order.id, evidence.providerReference, completedAt],
    );

    const entitlement = await database.query<{ id: string; previous_status: string }>(
      `with previous as (
         select id, status
           from entitlements
          where source_order_id = $1 and status <> 'refunded'
          for update
       ),
       updated as (
         update entitlements e
            set status = 'refunded', updated_at = $2
           from previous p
          where e.id = p.id
          returning e.id, p.status as previous_status
       )
       select id, previous_status from updated`,
      [order.id, completedAt],
    );
    const entitlementRow = entitlement.rows[0];
    if (entitlementRow) {
      await database.query(
        `insert into entitlement_events (
           entitlement_id, action, actor_type, reason, evidence_reference,
           previous_status, next_status, created_at
         )
         values ($1, 'refund', 'system', 'Accepted JazzCash CPS refund', $2, $3, 'refunded', $4)`,
        [
          entitlementRow.id,
          evidence.providerReference ?? evidence.payloadDigest,
          entitlementRow.previous_status,
          completedAt,
        ],
      );
      await database.query(
        `insert into commercial_events (
           user_id, event_name, plan_code, order_id, entitlement_id, properties, occurred_at
         )
         values ($1, 'entitlement_refunded', $2, $3, $4,
                 jsonb_build_object('verified', true, 'source', 'jazzcash_cps'), $5)`,
        [row.user_id, row.plan_code, order.id, entitlementRow.id, completedAt],
      );
    }

    await completeProviderJob(database, job, completedAt);
  });
}

async function processProviderJob(
  pool: DatabaseClient["pool"],
  cps: JazzCashCpsClient | undefined,
  job: JobRow,
  now: () => Date,
): Promise<void> {
  if (!cps || !job.order_id) {
    throw new Error("The provider-specific JazzCash CPS adapter is not configured.");
  }
  const order = await loadProviderOrder(pool, job.order_id);

  if (job.job_type === "provider_status") {
    const evidence = await cps.inquire({ merchantReference: order.merchant_reference });
    await persistStatusInquiry(pool, job, order, evidence, now());
    return;
  }

  if (job.job_type === "provider_refund") {
    if (order.status === "refunded") {
      await transaction(pool, (database) => completeProviderJob(database, job, now()));
      return;
    }
    if (order.status !== "succeeded") {
      throw new Error("A JazzCash refund job requires a verified successful order.");
    }
    const evidence = await cps.refund({
      merchantReference: order.merchant_reference,
      amountMinor: order.amount_minor,
      currency: order.currency,
    });
    await persistAcceptedRefund(pool, job, order, evidence, now());
    return;
  }

  throw new Error(`Unsupported JazzCash provider job: ${job.job_type}`);
}

export type CommercialAutomationService = Readonly<{
  schedule: () => Promise<Readonly<Record<string, number>>>;
  process: (limit?: number) => Promise<Readonly<Record<string, number>>>;
  run: (limit?: number) => Promise<CommercialMaintenanceSummary>;
}>;

export function createCommercialAutomationService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    jazzCashCps?: JazzCashCpsClient | undefined;
    now?: () => Date;
  }>,
): CommercialAutomationService {
  const now = options.now ?? (() => new Date());

  const schedule: CommercialAutomationService["schedule"] = async () => {
    const at = now();
    const expiredOrders = await options.pool.query(
      `insert into commercial_jobs (job_type, order_id, status, run_after)
       select 'expire_order', po.id, 'queued', $1
         from payment_orders po
        where po.status in ('created', 'pending')
          and po.checkout_expires_at <= $1
       on conflict (job_type, order_id) where order_id is not null and status in ('queued', 'running')
       do nothing`,
      [at],
    );
    const providerStatus = options.jazzCashCps
      ? await options.pool.query(
          `insert into commercial_jobs (job_type, order_id, status, run_after)
           select 'provider_status', po.id, 'queued', $1
             from payment_orders po
            where po.provider = 'jazzcash'
              and po.status = 'pending'
              and po.updated_at <= $1::timestamptz - interval '15 minutes'
              and not exists (
                select 1 from commercial_jobs j
                 where j.order_id = po.id
                   and j.job_type = 'provider_status'
                   and j.status in ('queued', 'running')
              )`,
          [at],
        )
      : { rowCount: 0 };
    const reconciliation = await options.pool.query(
      `insert into commercial_jobs (job_type, order_id, status, run_after)
       select 'reconcile_order', po.id, 'queued', $1
         from payment_orders po
        where po.status = 'pending'
          and po.updated_at <= $1::timestamptz - interval '30 minutes'
       on conflict (job_type, order_id) where order_id is not null and status in ('queued', 'running')
       do nothing`,
      [at],
    );
    const expiredEntitlements = await options.pool.query(
      `insert into commercial_jobs (job_type, entitlement_id, status, run_after)
       select 'expire_entitlement', e.id, 'queued', $1
         from entitlements e
        where e.status in ('active', 'grace')
          and coalesce(e.grace_ends_at, e.ends_at) <= $1
       on conflict (job_type, entitlement_id) where entitlement_id is not null and status in ('queued', 'running')
       do nothing`,
      [at],
    );
    const renewalReminders = await options.pool.query(
      `insert into commercial_jobs (job_type, entitlement_id, status, run_after)
       select 'renewal_reminder', e.id, 'queued', $1
         from entitlements e
        where e.status = 'active'
          and e.ends_at > $1
          and e.ends_at <= $1 + interval '7 days'
       on conflict (job_type, entitlement_id) where entitlement_id is not null and status in ('queued', 'running')
       do nothing`,
      [at],
    );
    return {
      expireOrder: count(expiredOrders),
      providerStatus: count(providerStatus),
      reconcileOrder: count(reconciliation),
      expireEntitlement: count(expiredEntitlements),
      renewalReminder: count(renewalReminders),
    };
  };

  const process: CommercialAutomationService["process"] = async (limit = 100) => {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const processed: Record<string, number> = {};

    for (let index = 0; index < safeLimit; index += 1) {
      const job = await transaction(options.pool, async (database) => {
        const claimedAt = now();
        const leaseToken = randomUUID();
        const leaseExpiresAt = new Date(claimedAt.getTime() + 120_000);
        const result = await database.query<JobRow>(
          `with candidate as (
             select id
               from commercial_jobs
              where (status = 'queued' and run_after <= $1)
                 or (status = 'running' and lease_expires_at <= $1)
              order by run_after, created_at
              limit 1
              for update skip locked
           )
           update commercial_jobs j
              set status = 'running', lease_token = $2, lease_expires_at = $3,
                  attempt_count = attempt_count + 1, updated_at = $1
             from candidate
            where j.id = candidate.id
            returning j.id, j.job_type, j.order_id, j.entitlement_id,
                      j.attempt_count, j.lease_token`,
          [claimedAt, leaseToken, leaseExpiresAt],
        );
        return result.rows[0] ?? null;
      });
      if (!job) break;

      try {
        if (["provider_status", "provider_refund"].includes(job.job_type)) {
          await processProviderJob(options.pool, options.jazzCashCps, job, now);
        } else {
          await transaction(options.pool, async (database) => {
            const completedAt = now();
            if (job.job_type === "expire_order" && job.order_id) {
              await database.query(
                `update payment_orders
                    set status = 'expired', failure_code = 'checkout_expired',
                        failure_message = 'The payment checkout window expired.', updated_at = $2
                  where id = $1 and status in ('created', 'pending')`,
                [job.order_id, completedAt],
              );
            } else if (job.job_type === "reconcile_order" && job.order_id) {
              const order = await database.query<{ status: string; merchant_reference: string }>(
                `select status, merchant_reference from payment_orders where id = $1 for update`,
                [job.order_id],
              );
              const row = order.rows[0];
              if (row && row.status === "pending") {
                await database.query(
                  `insert into reconciliation_cases
                    (order_id, mismatch_kind, status, provider_evidence, internal_evidence, created_at)
                   values ($1, 'missing_provider', 'open', '{}'::jsonb, $2::jsonb, $3)
                   on conflict (order_id, mismatch_kind) where status = 'open' do nothing`,
                  [
                    job.order_id,
                    JSON.stringify({
                      status: row.status,
                      merchantReference: row.merchant_reference,
                      reason: "Pending payment exceeded the internal recovery window.",
                    }),
                    completedAt,
                  ],
                );
              }
            } else if (job.job_type === "expire_entitlement" && job.entitlement_id) {
              const entitlement = await database.query<{ status: string }>(
                `select status from entitlements where id = $1 for update`,
                [job.entitlement_id],
              );
              const current = entitlement.rows[0]?.status;
              if (current === "active" || current === "grace") {
                await database.query(
                  `update entitlements
                      set status = 'expired', updated_at = $2
                    where id = $1`,
                  [job.entitlement_id, completedAt],
                );
                await database.query(
                  `insert into entitlement_events
                    (entitlement_id, action, actor_type, reason,
                     previous_status, next_status, created_at)
                   values ($1, 'expire', 'system', 'Entitlement reached its verified end date.', $2, 'expired', $3)`,
                  [job.entitlement_id, current, completedAt],
                );
              }
            } else if (job.job_type === "renewal_reminder" && job.entitlement_id) {
              const entitlement = await database.query<{ status: string; ends_at: Date }>(
                `select status, ends_at from entitlements where id = $1`,
                [job.entitlement_id],
              );
              const row = entitlement.rows[0];
              if (row?.status === "active") {
                await database.query(
                  `insert into privileged_audit_events
                    (actor_user_id, action, target_type, target_id, result, reason,
                     correlation_id, release_sha, metadata, created_at)
                   values (null, 'commercial.renewal.reminder_due', 'entitlement', $1,
                           'succeeded', 'Manual renewal reminder became due.', $2,
                           'commercial-maintenance', $3::jsonb, $4)`,
                  [
                    job.entitlement_id,
                    job.id,
                    JSON.stringify({ endsAt: row.ends_at.toISOString() }),
                    completedAt,
                  ],
                );
              }
            }

            await completeProviderJob(database, job, completedAt);
          });
        }
        processed[job.job_type] = (processed[job.job_type] ?? 0) + 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Commercial job failed.";
        await options.pool.query(
          `update commercial_jobs
              set status = case when attempt_count >= 10 then 'failed' else 'queued' end,
                  run_after = $2,
                  lease_token = null,
                  lease_expires_at = null,
                  last_error = $3,
                  updated_at = $4
            where id = $1`,
          [
            job.id,
            new Date(
              now().getTime() + Math.min(900, 2 ** Math.min(job.attempt_count, 10) * 5) * 1000,
            ),
            message.slice(0, 2000),
            now(),
          ],
        );
        processed["failed"] = (processed["failed"] ?? 0) + 1;
      }
    }

    return processed;
  };

  return {
    schedule,
    process,
    run: async (limit) => ({ scheduled: await schedule(), processed: await process(limit) }),
  };
}
