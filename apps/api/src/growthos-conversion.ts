import type { DatabaseClient } from "@skillup/database";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTEMPTS = 5;
type Pool = DatabaseClient["pool"];
type Fetcher = typeof fetch;

export type GrowthosBridgeConfig = Readonly<{
  url: string;
  token: string;
  brandId: string;
  testTraffic: boolean;
  /** Optional server-only Vercel Automation Bypass credential for protected staging. */
  vercelProtectionBypassSecret?: string;
}>;

export type VerifiedSkillupOrder = Readonly<{
  id: string;
  status: string;
  plan_code: string;
  amount_minor: number;
  currency: string;
  completed_at: Date;
  created_at: Date;
  attribution: unknown;
}>;

type DeliveryRow = Readonly<{ order_id: string; attempts: number }>;
export type ConversionOutcome = Readonly<{
  outcome: "delivered" | "retry" | "blocked";
  httpStatus: number | null;
  reason: string | null;
}>;

export function readGrowthosBridgeConfig(
  env: Readonly<Record<string, string | undefined>>,
  environment: "local" | "test" | "staging" | "production",
): GrowthosBridgeConfig | null {
  if (env["GROWTHOS_CONVERSION_ENABLED"] !== "true") return null;
  if (environment === "production" && env["GROWTHOS_PRODUCTION_APPROVED"] !== "true") {
    throw new Error("GrowthOS payment conversion relay requires explicit production approval.");
  }
  const rawUrl = env["GROWTHOS_CONVERSION_URL"];
  const token = env["GROWTHOS_CONVERSION_SECRET"] ?? "";
  const brandId = env["GROWTHOS_BRAND_ID"] ?? "";
  const vercelBypass = env["GROWTHOS_VERCEL_PROTECTION_BYPASS_SECRET"];
  if (vercelBypass && !/^[A-Za-z0-9]{32}$/.test(vercelBypass)) {
    throw new Error("Invalid Vercel automation bypass credential configuration.");
  }
  if (!rawUrl || token.length < 32 || !UUID.test(brandId)) {
    throw new Error("GrowthOS conversion endpoint, product UUID or server secret is missing.");
  }
  const url = new URL(rawUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/conversions" ||
    !url.hostname ||
    url.port
  ) {
    throw new Error("GrowthOS conversion URL must be an explicit HTTPS /api/conversions endpoint.");
  }
  return {
    url: url.toString(),
    token,
    brandId,
    testTraffic: environment !== "production",
    ...(vercelBypass ? { vercelProtectionBypassSecret: vercelBypass } : {}),
  };
}

const field = (value: Record<string, unknown>, key: string): string | null =>
  typeof value[key] === "string" && value[key].trim()
    ? (value[key] as string).trim().slice(0, 160)
    : null;

const uuid = (value: string | null): string | null =>
  value && UUID.test(value) ? value.toLowerCase() : null;

function source(value: string | null): string | null {
  const normalized = value?.toLowerCase() ?? null;
  if (
    normalized === "m" ||
    normalized === "meta" ||
    normalized === "facebook" ||
    normalized === "instagram"
  )
    return "meta";
  if (normalized === "t" || normalized === "tiktok") return "tiktok";
  if (normalized === "google" || normalized === "organic") return normalized;
  return null;
}

/**
 * A callback may only originate from a settled local payment with an active
 * entitlement and verified provider evidence. This pure function is never
 * called with an unchecked client payment claim.
 *
 * The product owns the charged amount: GrowthOS's advertised price is NOT a
 * payment authority. The rollout is blocked until both catalogues are aligned.
 */
export function buildGrowthosConversion(
  order: VerifiedSkillupOrder,
  config: GrowthosBridgeConfig,
): Readonly<Record<string, unknown>> | null {
  if (
    order.status !== "succeeded" ||
    order.currency !== "PKR" ||
    !Number.isSafeInteger(order.amount_minor) ||
    order.amount_minor <= 0 ||
    !UUID.test(order.id) ||
    !(order.completed_at instanceof Date) ||
    Number.isNaN(order.completed_at.getTime()) ||
    !(order.created_at instanceof Date) ||
    Number.isNaN(order.created_at.getTime()) ||
    !order.attribution ||
    typeof order.attribution !== "object" ||
    Array.isArray(order.attribution)
  )
    return null;
  const attribution = order.attribution as Record<string, unknown>;
  const pageId = uuid(field(attribution, "growthos_page_id"));
  const versionId = uuid(field(attribution, "growthos_version_id"));
  const packageId = uuid(field(attribution, "growthos_package_id"));
  const packageCode = field(attribution, "growthos_package_code");
  const variationId = uuid(field(attribution, "growthos_variation_id"));
  const variationVersionId = uuid(field(attribution, "growthos_variation_version_id"));
  const campaignId = uuid(field(attribution, "growthos_campaign_id"));
  const variantId = uuid(field(attribution, "growthos_variant_id"));
  const sessionId = field(attribution, "growthos_session_id");
  if (
    !pageId ||
    !versionId ||
    !packageId ||
    !packageCode ||
    (field(attribution, "growthos_variation_id") && !variationId) ||
    (field(attribution, "growthos_variation_version_id") && !variationVersionId) ||
    (field(attribution, "growthos_campaign_id") && !campaignId) ||
    (field(attribution, "growthos_variant_id") && !variantId) ||
    (variationVersionId && !variationId) ||
    (variationId && variantId) ||
    (sessionId && sessionId.length < 8) ||
    !(
      (packageCode === "1" && order.plan_code === "premium-monthly") ||
      (packageCode === "2" && order.plan_code === "premium-yearly")
    )
  )
    return null;
  const trafficSource = source(field(attribution, "utm_source") ?? field(attribution, "utm"));
  const rawCampaign = field(attribution, "utm_campaign");
  const medium =
    field(attribution, "utm_medium") ??
    (trafficSource === "meta" || trafficSource === "tiktok" ? "paid_social" : "organic");
  const touch = trafficSource
    ? {
        source: trafficSource,
        medium,
        campaign: rawCampaign,
        capturedAt: order.created_at.toISOString(),
      }
    : null;
  return {
    idempotencyKey: `skillup-${order.id}`,
    eventName: packageCode === "2" ? "purchase" : "subscription_started",
    occurredAt: order.completed_at.toISOString(),
    brandId: config.brandId,
    campaignId,
    pageId,
    versionId,
    variantId,
    sessionId,
    value: order.amount_minor / 100,
    currency: "PKR",
    attribution: { firstTouch: touch, lastTouch: touch },
    properties: {
      packageId,
      packageCode,
      variationId,
      variationVersionId,
      // Terms acceptance is not consent for advertising measurement.
      marketingConsent: false,
      testTraffic: config.testTraffic || field(attribution, "growthos_test") === "1",
    },
  };
}

export async function submitGrowthosConversion(
  body: Readonly<Record<string, unknown>>,
  config: GrowthosBridgeConfig,
  fetcher: Fetcher = fetch,
): Promise<ConversionOutcome> {
  try {
    const response = await fetcher(config.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        accept: "application/json",
        ...(config.vercelProtectionBypassSecret
          ? { "x-vercel-protection-bypass": config.vercelProtectionBypassSecret }
          : {}),
      },
      body: JSON.stringify(body),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status >= 300 && response.status < 400) {
      return { outcome: "blocked", httpStatus: response.status, reason: "redirect_rejected" };
    }
    if (response.status === 200 || response.status === 201) {
      const result = (await response.json().catch(() => null)) as unknown;
      if (
        result &&
        typeof result === "object" &&
        (result as { accepted?: unknown }).accepted === true
      ) {
        return { outcome: "delivered", httpStatus: response.status, reason: null };
      }
      return { outcome: "retry", httpStatus: response.status, reason: "unconfirmed_response" };
    }
    return {
      outcome:
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404 ||
        response.status === 422
          ? "blocked"
          : "retry",
      httpStatus: response.status,
      reason: "callback_rejected",
    };
  } catch {
    return { outcome: "retry", httpStatus: null, reason: "network_error" };
  }
}

/**
 * Maintenance worker. Only JazzCash orders with a verified successful payment
 * event and active entitlement can enter the outbox. A row holds no PII.
 * SKIP LOCKED leases and stable order ID support multi-instance operation.
 */
export function createGrowthosConversionTask(
  input: Readonly<{
    pool: Pool;
    config: GrowthosBridgeConfig | null;
    fetcher?: Fetcher;
  }>,
) {
  return async (
    limit = 10,
  ): Promise<Readonly<{ queued: number; delivered: number; blocked: number; retry: number }>> => {
    const config = input.config;
    if (!config) return { queued: 0, delivered: 0, blocked: 0, retry: 0 };
    const safeLimit = Math.min(10, Math.max(1, Math.floor(limit)));
    const queued = await input.pool.query(
      `insert into growthos_conversion_outbox(order_id)
         select o.id from payment_orders o
         where o.status = 'succeeded' and o.provider = 'jazzcash'
           and o.completed_at is not null
           and o.attribution ? 'growthos_page_id'
           and o.attribution ? 'growthos_version_id'
           and o.attribution ? 'growthos_package_id'
           and o.attribution ? 'growthos_package_code'
           and exists (select 1 from entitlements e where e.source_order_id=o.id and e.status='active')
           and exists (select 1 from payment_events ev where ev.order_id=o.id
               and ev.provider='jazzcash'
               and ev.event_type in ('checkout_return', 'ipn', 'status_query')
               and ev.signature_verified=true and ev.provider_status='000')
         on conflict (order_id) do nothing`,
    );
    const claimed = await input.pool.query<DeliveryRow>(
      `with due as (
         select order_id from growthos_conversion_outbox
         where attempts < $1
           and ((status='pending' and available_at <= now())
             or (status='processing' and lease_expires_at <= now()))
         order by created_at
         limit $2 for update skip locked
       )
       update growthos_conversion_outbox q
          set status='processing', attempts=q.attempts+1,
              lease_expires_at=now()+interval '90 seconds', updated_at=now()
         from due where q.order_id=due.order_id
       returning q.order_id, q.attempts`,
      [MAX_ATTEMPTS, safeLimit],
    );
    const counts = { queued: queued.rowCount ?? 0, delivered: 0, blocked: 0, retry: 0 };
    for (const item of claimed.rows) {
      const [row] = (
        await input.pool.query<VerifiedSkillupOrder>(
          `select o.id::text, o.status, p.code as plan_code, o.amount_minor, o.currency,
                o.completed_at, o.created_at, o.attribution
           from payment_orders o
           join commercial_plan_versions v on v.id=o.plan_version_id
           join commercial_plans p on p.id=v.plan_id
           where o.id=$1 and o.status='succeeded' and o.provider='jazzcash'
             and exists(select 1 from entitlements e
               where e.source_order_id=o.id and e.status='active')
             and exists(select 1 from payment_events ev
               where ev.order_id=o.id and ev.provider='jazzcash'
                 and ev.event_type in ('checkout_return', 'ipn', 'status_query')
                 and ev.signature_verified=true and ev.provider_status='000')
           limit 1`,
          [item.order_id],
        )
      ).rows;
      const payload = row ? buildGrowthosConversion(row, config) : null;
      const outcome: ConversionOutcome = payload
        ? await submitGrowthosConversion(payload, config, input.fetcher)
        : { outcome: "blocked", httpStatus: null, reason: "ineligible_verified_order" };
      const state =
        outcome.outcome === "retry"
          ? item.attempts >= MAX_ATTEMPTS
            ? "failed"
            : "pending"
          : outcome.outcome;
      const retrySeconds = [60, 300, 900, 3600][Math.min(item.attempts - 1, 3)] ?? 3600;
      await input.pool.query(
        `update growthos_conversion_outbox
           set status=$2, available_at=now()+($3::int * interval '1 second'),
               lease_expires_at=null, delivered_at=case when $2='delivered' then now() else null end,
               last_http_status=$4, last_error_code=$5, updated_at=now()
           where order_id=$1 and status='processing' and attempts=$6`,
        [
          item.order_id,
          state,
          state === "pending" ? retrySeconds : 0,
          outcome.httpStatus,
          outcome.reason,
          item.attempts,
        ],
      );
      if (outcome.outcome === "delivered") counts.delivered++;
      else if (outcome.outcome === "blocked") counts.blocked++;
      else counts.retry++;
    }
    return counts;
  };
}
