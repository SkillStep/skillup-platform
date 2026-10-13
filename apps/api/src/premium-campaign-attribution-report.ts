import type { DatabaseClient } from "@skillup/database";

import {
  PREMIUM_REPORT_TIMEZONE,
  type PremiumReportQuery,
  resolvePremiumReportRange,
} from "./premium-reporting-contract.js";

export const CAMPAIGN_ATTRIBUTION_SCHEMA_VERSION = "premium-campaign-attribution.v1";

export type CampaignAttributionFact = Readonly<{
  date: string;
  platform: string;
  package: string;
  parameter: string;
  subscriptions: number;
  amountMinor: number;
}>;

export type CampaignAttributionReport = Readonly<{
  reportSchemaVersion: string;
  timezone: string;
  effectiveRange: Readonly<{ from: string; to: string; preset: string }>;
  aggregation: string;
  totals: Readonly<{ subscriptions: number; amountMinor: number }>;
  basic: readonly CampaignAttributionFact[];
  detailed: Readonly<{
    platformByParameter: readonly Readonly<{
      date: string;
      platform: string;
      parameter: string;
      subscriptions: number;
      amountMinor: number;
    }>[];
    packageByParameter: readonly Readonly<{
      date: string;
      package: string;
      parameter: string;
      subscriptions: number;
      amountMinor: number;
    }>[];
  }>;
  daily: readonly Readonly<{
    date: string;
    subscriptions: number;
    amountMinor: number;
    byPlatform: Readonly<Record<string, number>>;
    byPackage: Readonly<Record<string, number>>;
    byParameter: Readonly<Record<string, number>>;
  }>[];
  exportRows: readonly Readonly<Record<string, string | number>>[];
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

/** Missing UTM dims show as "none" (payment succeeded without campaign attribution). */
function dim(value: unknown): string {
  if (typeof value !== "string") return "none";
  const trimmed = value.trim();
  return trimmed || "none";
}

function mergeCount(
  map: Record<string, { subscriptions: number; amountMinor: number }>,
  key: string,
  subscriptions: number,
  amountMinor: number,
): void {
  const existing = map[key];
  if (existing) {
    existing.subscriptions += subscriptions;
    existing.amountMinor += amountMinor;
    return;
  }
  map[key] = { subscriptions, amountMinor };
}

/** Pure aggregator used by the query service and unit tests. */
export function buildCampaignAttributionReport(
  facts: readonly CampaignAttributionFact[],
  query: PremiumReportQuery,
  now: Date = new Date(),
): CampaignAttributionReport {
  const range = resolvePremiumReportRange(query, now);
  const basic = [...mergeCampaignAttributionFacts(facts)].sort((left, right) => {
    const dateCmp = left.date.localeCompare(right.date);
    if (dateCmp !== 0) return dateCmp;
    const platformCmp = left.platform.localeCompare(right.platform);
    if (platformCmp !== 0) return platformCmp;
    const packageCmp = left.package.localeCompare(right.package);
    if (packageCmp !== 0) return packageCmp;
    return left.parameter.localeCompare(right.parameter);
  });

  const totals = basic.reduce(
    (acc, row) => {
      acc.subscriptions += row.subscriptions;
      acc.amountMinor += row.amountMinor;
      return acc;
    },
    { subscriptions: 0, amountMinor: 0 },
  );

  const platformParameter = new Map<
    string,
    {
      date: string;
      platform: string;
      parameter: string;
      subscriptions: number;
      amountMinor: number;
    }
  >();
  const packageParameter = new Map<
    string,
    { date: string; package: string; parameter: string; subscriptions: number; amountMinor: number }
  >();
  const dailyMap = new Map<
    string,
    {
      date: string;
      subscriptions: number;
      amountMinor: number;
      byPlatform: Record<string, number>;
      byPackage: Record<string, number>;
      byParameter: Record<string, number>;
    }
  >();

  for (const row of basic) {
    const ppKey = `${row.date}\0${row.platform}\0${row.parameter}`;
    const existingPp = platformParameter.get(ppKey);
    if (existingPp) {
      existingPp.subscriptions += row.subscriptions;
      existingPp.amountMinor += row.amountMinor;
    } else {
      platformParameter.set(ppKey, {
        date: row.date,
        platform: row.platform,
        parameter: row.parameter,
        subscriptions: row.subscriptions,
        amountMinor: row.amountMinor,
      });
    }

    const pkgKey = `${row.date}\0${row.package}\0${row.parameter}`;
    const existingPkg = packageParameter.get(pkgKey);
    if (existingPkg) {
      existingPkg.subscriptions += row.subscriptions;
      existingPkg.amountMinor += row.amountMinor;
    } else {
      packageParameter.set(pkgKey, {
        date: row.date,
        package: row.package,
        parameter: row.parameter,
        subscriptions: row.subscriptions,
        amountMinor: row.amountMinor,
      });
    }

    const day = dailyMap.get(row.date) ?? {
      date: row.date,
      subscriptions: 0,
      amountMinor: 0,
      byPlatform: {},
      byPackage: {},
      byParameter: {},
    };
    day.subscriptions += row.subscriptions;
    day.amountMinor += row.amountMinor;
    day.byPlatform[row.platform] = (day.byPlatform[row.platform] ?? 0) + row.subscriptions;
    day.byPackage[row.package] = (day.byPackage[row.package] ?? 0) + row.subscriptions;
    day.byParameter[row.parameter] = (day.byParameter[row.parameter] ?? 0) + row.subscriptions;
    dailyMap.set(row.date, day);
  }

  const platformByParameter = [...platformParameter.values()].sort((left, right) => {
    const dateCmp = left.date.localeCompare(right.date);
    if (dateCmp !== 0) return dateCmp;
    const platformCmp = left.platform.localeCompare(right.platform);
    if (platformCmp !== 0) return platformCmp;
    return left.parameter.localeCompare(right.parameter);
  });
  const packageByParameter = [...packageParameter.values()].sort((left, right) => {
    const dateCmp = left.date.localeCompare(right.date);
    if (dateCmp !== 0) return dateCmp;
    const packageCmp = left.package.localeCompare(right.package);
    if (packageCmp !== 0) return packageCmp;
    return left.parameter.localeCompare(right.parameter);
  });
  const daily = [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date));

  const exportRows: Readonly<Record<string, string | number>>[] = [
    {
      view: "total",
      date: "*",
      platform: "*",
      package: "*",
      parameter: "*",
      subscriptions: totals.subscriptions,
      amountMinor: totals.amountMinor,
    },
    ...basic.map((row) => ({
      view: "basic",
      date: row.date,
      platform: row.platform,
      package: row.package,
      parameter: row.parameter,
      subscriptions: row.subscriptions,
      amountMinor: row.amountMinor,
    })),
    ...platformByParameter.map((row) => ({
      view: "platform_x_parameter",
      date: row.date,
      platform: row.platform,
      package: "*",
      parameter: row.parameter,
      subscriptions: row.subscriptions,
      amountMinor: row.amountMinor,
    })),
    ...packageByParameter.map((row) => ({
      view: "package_x_parameter",
      date: row.date,
      platform: "*",
      package: row.package,
      parameter: row.parameter,
      subscriptions: row.subscriptions,
      amountMinor: row.amountMinor,
    })),
    ...daily.map((row) => ({
      view: "daily",
      date: row.date,
      platform: "*",
      package: "*",
      parameter: "*",
      subscriptions: row.subscriptions,
      amountMinor: row.amountMinor,
    })),
  ];

  return {
    reportSchemaVersion: CAMPAIGN_ATTRIBUTION_SCHEMA_VERSION,
    timezone: PREMIUM_REPORT_TIMEZONE,
    effectiveRange: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      preset: range.preset,
    },
    aggregation: range.aggregation,
    totals,
    basic,
    detailed: {
      platformByParameter,
      packageByParameter,
    },
    daily,
    exportRows,
  };
}

export async function loadCampaignAttributionFacts(
  pool: DatabaseClient["pool"],
  query: PremiumReportQuery,
  now: Date = new Date(),
): Promise<readonly CampaignAttributionFact[]> {
  const range = resolvePremiumReportRange(query, now);
  const result = await pool.query<Record<string, unknown>>(
    `select
       to_char(date_trunc('day', o.completed_at at time zone 'Asia/Karachi'), 'YYYY-MM-DD') as date,
       coalesce(
         nullif(btrim(o.attribution->>'utm'), ''),
         nullif(btrim(o.attribution->>'utm_source'), ''),
         'none'
       ) as platform,
       coalesce(nullif(btrim(o.attribution->>'package'), ''), 'none') as package,
       coalesce(nullif(btrim(o.attribution->>'parameter'), ''), 'none') as parameter,
       count(*)::integer as subscriptions,
       coalesce(sum(o.amount_minor), 0)::bigint as "amountMinor"
     from payment_orders o
     join commercial_plan_versions v on v.id = o.plan_version_id
     join commercial_plans p on p.id = v.plan_id
    where o.status = 'succeeded'
      and o.completed_at is not null
      and o.completed_at >= $1
      and o.completed_at < $2
      and coalesce(o.attribution->>'omitFromCampaignReport', 'false') <> 'true'
      and ($3::text is null or p.code = $3)
      and ($4::uuid is null or o.plan_version_id = $4)
      and ($5::text is null or o.payment_purpose = $5)
    group by 1, 2, 3, 4
    order by 1, 2, 3, 4`,
    [
      range.from,
      range.to,
      query.planCode ?? null,
      query.planVersionId ?? null,
      query.paymentPurpose ?? null,
    ],
  );

  return result.rows.map((row) => ({
    date: dim(row["date"]),
    platform: dim(row["platform"]),
    package: dim(row["package"]),
    parameter: dim(row["parameter"]),
    subscriptions: asNumber(row["subscriptions"]),
    amountMinor: asNumber(row["amountMinor"]),
  }));
}

export async function loadCampaignAttributionReport(
  pool: DatabaseClient["pool"],
  query: PremiumReportQuery,
  now: Date = new Date(),
): Promise<CampaignAttributionReport> {
  const facts = await loadCampaignAttributionFacts(pool, query, now);
  return buildCampaignAttributionReport(facts, query, now);
}

/** Test helper: collapse duplicate fact keys the same way SQL group-by would. */
export function mergeCampaignAttributionFacts(
  facts: readonly CampaignAttributionFact[],
): readonly CampaignAttributionFact[] {
  const map: Record<string, { subscriptions: number; amountMinor: number }> = {};
  const meta = new Map<string, Omit<CampaignAttributionFact, "subscriptions" | "amountMinor">>();
  for (const fact of facts) {
    const key = `${fact.date}\0${fact.platform}\0${fact.package}\0${fact.parameter}`;
    mergeCount(map, key, fact.subscriptions, fact.amountMinor);
    meta.set(key, {
      date: fact.date,
      platform: fact.platform,
      package: fact.package,
      parameter: fact.parameter,
    });
  }
  return [...meta.entries()].map(([key, dims]) => ({
    ...dims,
    subscriptions: map[key]?.subscriptions ?? 0,
    amountMinor: map[key]?.amountMinor ?? 0,
  }));
}
