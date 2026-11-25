import type { LandingCampaign } from "./landing-campaign";
import { planCodeForPackage } from "./landing-campaign";
import { logGa4Event } from "./ga4";
import { ensureTikTokPixel, logTikTokEvent } from "./tiktok-pixel";
import { readStoredAttribution } from "./utm-attribution";

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
    value: 990,
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

/**
 * Rebuild analytics context after JazzCash return when sessionStorage `lp_context` was
 * dropped (cross-origin host change, new tab, or private-mode quirks). Prefer durable
 * UTM attribution from localStorage; else fall back to TikTok landing2 defaults.
 */
export function rebuildLandingAnalyticsContext(): LandingAnalyticsContext {
  const stored = readStoredAttribution();
  const campaign: LandingCampaign = {
    utm: stored.utm?.trim() || "T",
    package: stored.package?.trim() || "2",
    parameter: stored.parameter?.trim() || "20percentoff",
    payment: stored.payment?.trim() || "jazzcash",
  };
  const landing = stored.landing?.trim() || "landing2";
  return buildLandingAnalyticsContext(campaign, { landing });
}

function readStorageJson<T>(storage: Storage | undefined, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStorageJson(storage: Storage | undefined, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / private mode.
  }
}

function browserSessionStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function browserLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isValidContext(stored: LandingAnalyticsContext | null): stored is LandingAnalyticsContext {
  return Boolean(stored && typeof stored === "object" && stored.package_id && stored.conversion_event);
}

export function persistLandingAnalyticsContext(context: LandingAnalyticsContext): void {
  // Dual-write: session for same-tab; localStorage survives JazzCash cross-site return (§3A).
  writeStorageJson(browserSessionStorage(), LP_CONTEXT_STORAGE_KEY, context);
  writeStorageJson(browserLocalStorage(), LP_CONTEXT_STORAGE_KEY, context);
}

export function readLandingAnalyticsContext(): LandingAnalyticsContext | null {
  const fromSession = readStorageJson<LandingAnalyticsContext>(
    browserSessionStorage(),
    LP_CONTEXT_STORAGE_KEY,
  );
  if (isValidContext(fromSession)) return fromSession;

  const fromLocal = readStorageJson<LandingAnalyticsContext>(
    browserLocalStorage(),
    LP_CONTEXT_STORAGE_KEY,
  );
  if (isValidContext(fromLocal)) {
    // Rehydrate session so subsequent reads in this tab stay fast.
    writeStorageJson(browserSessionStorage(), LP_CONTEXT_STORAGE_KEY, fromLocal);
    return fromLocal;
  }
  return null;
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
  const params = eventParams(context);
  logGa4Event("landing_view", params);
  logGa4Event("view_item", params);
  // TikTok (client-approved): PageView + ViewContent on landing open.
  logTikTokEvent("PageView", params);
  logTikTokEvent("ViewContent", params);
}

export function trackAddToCart(context: LandingAnalyticsContext): void {
  persistLandingAnalyticsContext(context);
  const params = eventParams(context, { user_state: "new" });
  logGa4Event("add_to_cart", params);
  logGa4Event("begin_checkout", eventParams(context));
  // TikTok (client-approved): Subscribe button → InitiateCheckout; JazzCash MSISDN → AddPaymentInfo.
  // Do not fire AddToCart on TikTok.
  logTikTokEvent("InitiateCheckout", params);
  logTikTokEvent("AddPaymentInfo", eventParams(context));
}

function hasSentToken(transactionId: string): boolean {
  const session = browserSessionStorage();
  const local = browserLocalStorage();
  const fromSession = readStorageJson<string[]>(session, LP_SENT_TOKENS_STORAGE_KEY) ?? [];
  const fromLocal = readStorageJson<string[]>(local, LP_SENT_TOKENS_STORAGE_KEY) ?? [];
  return fromSession.includes(transactionId) || fromLocal.includes(transactionId);
}

function markSentToken(transactionId: string): void {
  const merge = (storage: Storage | undefined): void => {
    const sent = readStorageJson<string[]>(storage, LP_SENT_TOKENS_STORAGE_KEY) ?? [];
    if (sent.includes(transactionId)) return;
    writeStorageJson(storage, LP_SENT_TOKENS_STORAGE_KEY, [...sent, transactionId].slice(-50));
  };
  merge(browserSessionStorage());
  merge(browserLocalStorage());
}

/**
 * Token-time conversion after JazzCash success.
 * Fires subscribe (monthly) or purchase (yearly) once per transaction_id.
 * Rebuilds context when sessionStorage was cleared by the JazzCash cross-site return (§3A).
 */
export function trackPaymentConversion(
  options: Readonly<{
    paymentStatus: string;
    transactionId: string;
    context?: LandingAnalyticsContext | null;
    /** When true, caller already verified the signed `cv` receipt (or cookie). */
    receiptVerified?: boolean;
  }>,
): void {
  const context =
    options.context ?? readLandingAnalyticsContext() ?? rebuildLandingAnalyticsContext();
  persistLandingAnalyticsContext(context);

  logGa4Event(
    "payment_result",
    eventParams(context, {
      payment_status: options.paymentStatus,
      transaction_id: options.transactionId,
    }),
  );

  if (options.paymentStatus !== "succeeded") return;
  if (!options.transactionId || hasSentToken(options.transactionId)) return;

  const conversionParams = eventParams(context, {
    transaction_id: options.transactionId,
    user_state: "new",
    receipt_verified: options.receiptVerified === true,
  });
  // Warm Pixel on payment-return pages (homepage) before Subscribe — landing may not
  // have loaded ttq in this document after JazzCash cross-site redirect (§3A).
  ensureTikTokPixel();
  // Mark after attempting beacons so a no-op Pixel load can still retry on refresh.
  logGa4Event(context.conversion_event, conversionParams);
  // TikTok (client-approved): Subscribe only on successful subscription. event_id = order id.
  // Do not fire CompletePayment on TikTok.
  logTikTokEvent("Subscribe", conversionParams, { eventId: options.transactionId });
  markSentToken(options.transactionId);
}
