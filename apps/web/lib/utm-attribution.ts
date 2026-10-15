import type { LandingCampaign } from "./landing-campaign";

/** localStorage key for last-touch Premium campaign attribution (30-day TTL). */
export const UTM_ATTRIBUTION_STORAGE_KEY = "skillup_utm_attribution";

const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const STRING_KEYS = [
  "utm",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "package",
  "parameter",
  "payment",
  "ref",
  "landing",
  "landingPath",
  "he",
] as const;

export type PremiumAttribution = Readonly<{
  utm?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  package?: string;
  parameter?: string;
  payment?: string;
  ref?: string;
  landing?: string;
  landingPath?: string;
  he?: string;
}>;

type StoredAttribution = Readonly<{
  attribution: PremiumAttribution;
  capturedAt: number;
}>;

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/** Normalize raw query / campaign fields into a sanitized attribution object. */
export function buildPremiumAttribution(
  input: Readonly<
    Partial<Record<(typeof STRING_KEYS)[number], string | null | undefined>> & {
      landing?: string | null;
      landingPath?: string | null;
    }
  >,
): PremiumAttribution {
  const out: Record<string, string> = {};
  for (const key of STRING_KEYS) {
    const raw = input[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    out[key] = clip(trimmed, key === "landingPath" ? 120 : 80);
  }
  if (out["utm"] && !out["utm_source"]) {
    out["utm_source"] = out["utm"];
  }
  return out;
}

/** Normalize Jazz HE query values (`he=1` / `he=0` / `he=nonhe`). */
export function normalizeHeQueryValue(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLocaleLowerCase("en-US");
  if (!value) return undefined;
  if (value === "1" || value === "true" || value === "he" || value === "yes") return "1";
  if (value === "0" || value === "false" || value === "nonhe" || value === "non-he" || value === "no") {
    return "0";
  }
  return undefined;
}

export function attributionFromLandingCampaign(
  campaign: LandingCampaign,
  options: Readonly<{ landing: string; landingPath?: string; he?: string | null }>,
): PremiumAttribution {
  const path =
    options.landingPath ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : `/${options.landing}`);
  const heFromUrl =
    options.he ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("he")
      : null);
  return buildPremiumAttribution({
    utm: campaign.utm,
    package: campaign.package,
    parameter: campaign.parameter,
    payment: campaign.payment,
    landing: options.landing,
    landingPath: path,
    he: normalizeHeQueryValue(heFromUrl),
  });
}

function readStored(): StoredAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(UTM_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed || typeof parsed !== "object" || typeof parsed.capturedAt !== "number") {
      return null;
    }
    if (Date.now() - parsed.capturedAt > ATTRIBUTION_TTL_MS) {
      window.localStorage.removeItem(UTM_ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    return {
      attribution: buildPremiumAttribution(parsed.attribution ?? {}),
      capturedAt: parsed.capturedAt,
    };
  } catch {
    return null;
  }
}

/** Persist last-touch attribution from a campaign landing (30-day TTL). */
export function captureLandingAttribution(
  campaign: LandingCampaign,
  options: Readonly<{ landing: string; landingPath?: string }>,
): PremiumAttribution {
  const attribution = attributionFromLandingCampaign(campaign, options);
  if (typeof window === "undefined") return attribution;
  try {
    const payload: StoredAttribution = {
      attribution,
      capturedAt: Date.now(),
    };
    window.localStorage.setItem(UTM_ATTRIBUTION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota / private-mode failures; in-memory return still works for this page.
  }
  return attribution;
}

/** Read stored attribution if still within TTL; otherwise empty object. */
export function readStoredAttribution(): PremiumAttribution {
  return readStored()?.attribution ?? {};
}

/**
 * Attribution to send on billing APIs: prefer fresh campaign stamp when provided,
 * else fall back to stored last-touch.
 */
export function attributionForBilling(
  campaign?: LandingCampaign,
  options?: Readonly<{ landing: string; landingPath?: string }>,
): PremiumAttribution {
  if (campaign && options) {
    return captureLandingAttribution(campaign, options);
  }
  return readStoredAttribution();
}
