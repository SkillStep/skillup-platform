import type { DatabaseClient } from "@skillup/database";

import { PREMIUM_REPORT_TIMEZONE } from "./premium-reporting-contract.js";

export type CampaignOpsDailyMetrics = Readonly<{
  date: string;
  landingTraffic: number;
  heTraffic: number;
  nonHeTraffic: number;
  untaggedNetworkTraffic: number;
  jazzcashPaywallTraffic: number;
  mpinCount: number;
  successCount: number;
  failureCount: number;
  failureReasons: readonly Readonly<{ reason: string; count: number }>[];
}>;

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeHeTag(raw: unknown): "he" | "nonhe" | "untagged" {
  if (typeof raw !== "string") return "untagged";
  const value = raw.trim().toLocaleLowerCase("en-US");
  if (value === "1" || value === "true" || value === "he" || value === "yes") return "he";
  if (
    value === "0" ||
    value === "false" ||
    value === "nonhe" ||
    value === "non-he" ||
    value === "no"
  ) {
    return "nonhe";
  }
  return "untagged";
}

/**
 * Ops funnel metrics for the 06:00 PKT daily email (yesterday Asia/Karachi by default).
 * Landing/paywall counts come from commercial_events; MPIN ≈ completed wallet-link intents;
 * success/failure from payment_orders.
 */
export async function loadCampaignOpsDailyMetrics(
  pool: DatabaseClient["pool"],
  options: Readonly<{ fromIso: string; toIso: string; reportDate: string }>,
): Promise<CampaignOpsDailyMetrics> {
  const [funnel, network, intents, payments, failures] = await Promise.all([
    pool.query<{ event_name: string; count: string }>(
      `select event_name, count(*)::text as count
         from commercial_events
        where occurred_at >= $1::timestamptz
          and occurred_at < $2::timestamptz
          and event_name in ('paywall_viewed', 'add_to_cart')
        group by event_name`,
      [options.fromIso, options.toIso],
    ),
    pool.query<{ he_tag: string | null; count: string }>(
      `select
          coalesce(
            nullif(properties #>> '{attribution,he}', ''),
            nullif(properties #>> '{he}', '')
          ) as he_tag,
          count(*)::text as count
         from commercial_events
        where occurred_at >= $1::timestamptz
          and occurred_at < $2::timestamptz
          and event_name = 'paywall_viewed'
        group by 1`,
      [options.fromIso, options.toIso],
    ),
    pool.query<{ status: string; count: string }>(
      `select status, count(*)::text as count
         from jazzcash_wallet_link_intents
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
        group by status`,
      [options.fromIso, options.toIso],
    ),
    pool.query<{ status: string; count: string }>(
      `select status, count(*)::text as count
         from payment_orders
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
          and status in ('succeeded', 'failed')
        group by status`,
      [options.fromIso, options.toIso],
    ),
    pool.query<{ reason: string; count: string }>(
      `select
          coalesce(nullif(trim(failure_message), ''), nullif(trim(failure_code), ''), 'unknown') as reason,
          count(*)::text as count
         from payment_orders
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
          and status = 'failed'
        group by 1
        order by count(*) desc
        limit 20`,
      [options.fromIso, options.toIso],
    ),
  ]);

  const funnelMap = new Map(funnel.rows.map((row) => [row.event_name, asNumber(row.count)]));
  let heTraffic = 0;
  let nonHeTraffic = 0;
  let untaggedNetworkTraffic = 0;
  for (const row of network.rows) {
    const count = asNumber(row.count);
    const tag = normalizeHeTag(row.he_tag);
    if (tag === "he") heTraffic += count;
    else if (tag === "nonhe") nonHeTraffic += count;
    else untaggedNetworkTraffic += count;
  }

  const intentMap = new Map(intents.rows.map((row) => [row.status, asNumber(row.count)]));
  const paymentMap = new Map(payments.rows.map((row) => [row.status, asNumber(row.count)]));

  return {
    date: options.reportDate,
    landingTraffic: funnelMap.get("paywall_viewed") ?? 0,
    heTraffic,
    nonHeTraffic,
    untaggedNetworkTraffic,
    jazzcashPaywallTraffic:
      (intentMap.get("pending") ?? 0) +
      (intentMap.get("completed") ?? 0) +
      (intentMap.get("failed") ?? 0) +
      (intentMap.get("expired") ?? 0),
    mpinCount: intentMap.get("completed") ?? 0,
    successCount: paymentMap.get("succeeded") ?? 0,
    failureCount: paymentMap.get("failed") ?? 0,
    failureReasons: failures.rows.map((row) => ({
      reason: row.reason || "unknown",
      count: asNumber(row.count),
    })),
  };
}

export function emptyCampaignOpsDailyMetrics(reportDate: string): CampaignOpsDailyMetrics {
  return {
    date: reportDate,
    landingTraffic: 0,
    heTraffic: 0,
    nonHeTraffic: 0,
    untaggedNetworkTraffic: 0,
    jazzcashPaywallTraffic: 0,
    mpinCount: 0,
    successCount: 0,
    failureCount: 0,
    failureReasons: [],
  };
}

export const CAMPAIGN_OPS_METRICS_TIMEZONE = PREMIUM_REPORT_TIMEZONE;
