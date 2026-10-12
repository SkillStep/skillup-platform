import type { LandingCampaign } from "./landing-campaign";
import { planCodeForPackage } from "./landing-campaign";
import { logGa4Event } from "./ga4";

export const LP_CONTEXT_STORAGE_KEY = "lp_context";
export const LP_SENT_TOKENS_STORAGE_KEY = "lp_sent_tokens";

export type TrafficSource = "meta" | "tiktok" | "direct";

export type LandingAnalyticsContext = Readonly<{
  traffic_source: TrafficSource;
  utm_code: string;
  package_id: string;
  banner_parameter: string;
  payment: string;
  landing: string;
  plan_code: "premium-monthly" | "premium-yearly";
  item_id: string;
  item_name: string;
  value: number;
  currency: "PKR";
  conversion_event: "subscribe" | "purchase";
}>;

function trafficSourceFromUtm(utm: string): TrafficSource {
  const normalized = utm.trim().toUpperCase();
  if (normalized === "M" || normalized === "META" || normalized === "FACEBOOK") return "meta";
  if (normalized === "T" || normalized === "TIKTOK") return "tiktok";
  return "direct";
}

/** Package → token-time GA4 event + list price (PKR major units). */
export function packageCommerceMapping(
  packageId: string,
  parameter: string,
): Readonly<{ conversion_event: "subscribe" | "purchase"; value: number; item_name: string }> {
  const plan = planCodeForPackage(packageId);
  if (plan === "premium-yearly") {
    const discounted = parameter.trim().toLowerCase() === "20percentoff";
    return {
      conversion_event: "purchase",
      value: discounted ? 3999 : 4999,
      item_name: discounted ? "SkillUp Premium Yearly (20% off)" : "SkillUp Premium Yearly",
    };
  }
  return {
    conversion_event: "subscribe",
    value: 599,
    item_name: "SkillUp Premium Monthly",
  };
}

export function buildLandingAnalyticsContext(
  campaign: LandingCampaign,
  options: Readonly<{ landing: string }>,
): LandingAnalyticsContext {
  const commerce = packageCommerceMapping(campaign.package, campaign.parameter);
  const planCode = planCodeForPackage(campaign.package);
  return {
    traffic_source: trafficSourceFromUtm(campaign.utm),
    utm_code: campaign.utm.trim() || "D",
    package_id: campaign.package,
    banner_parameter: campaign.parameter,
    payment: campaign.payment,
    landing: options.landing,
    plan_code: planCode,
    item_id: planCode,
    item_name: commerce.item_name,
    value: commerce.value,
    currency: "PKR",
    conversion_event: commerce.conversion_event,
  };
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / private mode.
  }
}

export function persistLandingAnalyticsContext(context: LandingAnalyticsContext): void {
  writeJson(LP_CONTEXT_STORAGE_KEY, context);
}

export function readLandingAnalyticsContext(): LandingAnalyticsContext | null {
  const stored = readJson<LandingAnalyticsContext>(LP_CONTEXT_STORAGE_KEY);
  if (!stored || typeof stored !== "object") return null;
  if (!stored.package_id || !stored.conversion_event) return null;
  return stored;
}

function eventParams(
  context: LandingAnalyticsContext,
  extra: Readonly<Record<string, string | number | boolean | undefined>> = {},
): Record<string, string | number | boolean | undefined> {
  return {
    traffic_source: context.traffic_source,
    utm_code: context.utm_code,
    package_id: context.package_id,
    banner_parameter: context.banner_parameter,
    landing: context.landing,
    currency: context.currency,
    value: context.value,
    item_id: context.item_id,
    item_name: context.item_name,
    ...extra,
  };
}

export function trackLandingView(context: LandingAnalyticsContext): void {
  persistLandingAnalyticsContext(context);
  logGa4Event("landing_view", eventParams(context));
  logGa4Event("view_item", eventParams(context));
}

export function trackAddToCart(context: LandingAnalyticsContext): void {
  persistLandingAnalyticsContext(context);
  logGa4Event("add_to_cart", eventParams(context, { user_state: "new" }));
  logGa4Event("begin_checkout", eventParams(context));
}

function hasSentToken(transactionId: string): boolean {
  const sent = readJson<string[]>(LP_SENT_TOKENS_STORAGE_KEY) ?? [];
  return sent.includes(transactionId);
}

function markSentToken(transactionId: string): void {
  const sent = readJson<string[]>(LP_SENT_TOKENS_STORAGE_KEY) ?? [];
  if (sent.includes(transactionId)) return;
  writeJson(LP_SENT_TOKENS_STORAGE_KEY, [...sent, transactionId].slice(-50));
}

/**
 * Token-time conversion after JazzCash success.
 * Fires subscribe (monthly) or purchase (yearly) once per transaction_id.
 */
export function trackPaymentConversion(
  options: Readonly<{
    paymentStatus: string;
    transactionId: string;
    context?: LandingAnalyticsContext | null;
  }>,
): void {
  const context = options.context ?? readLandingAnalyticsContext();
  if (!context) return;

  logGa4Event(
    "payment_result",
    eventParams(context, {
      payment_status: options.paymentStatus,
      transaction_id: options.transactionId,
    }),
  );

  if (options.paymentStatus !== "succeeded") return;
  if (!options.transactionId || hasSentToken(options.transactionId)) return;

  markSentToken(options.transactionId);
  logGa4Event(
    context.conversion_event,
    eventParams(context, {
      transaction_id: options.transactionId,
      user_state: "new",
    }),
  );
}
