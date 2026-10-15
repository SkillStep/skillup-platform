import { z } from "zod";

const ATTRIBUTION_STRING_KEYS = [
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
  /** Jazz HE vs NON-HE tag from landing URL (`he=1` / `he=0`). */
  "he",
] as const;

export type PremiumAttribution = Readonly<
  Partial<Record<(typeof ATTRIBUTION_STRING_KEYS)[number], string>> & {
    omitFromCampaignReport?: boolean;
  }
>;

const OptionalAttributionString = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

/** Client-supplied attribution body (strict allowlist; omit flag is server-only). */
export const PremiumAttributionInputSchema = z
  .object({
    utm: OptionalAttributionString,
    utm_source: OptionalAttributionString,
    utm_medium: OptionalAttributionString,
    utm_campaign: OptionalAttributionString,
    utm_content: OptionalAttributionString,
    package: OptionalAttributionString,
    parameter: OptionalAttributionString,
    payment: OptionalAttributionString,
    ref: OptionalAttributionString,
    landing: OptionalAttributionString,
    landingPath: OptionalAttributionString,
    he: OptionalAttributionString,
  })
  .strict();

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * Sanitize campaign attribution before any write path (user, intent, payment, events).
 * Rejects non-objects; allowlists keys; clips lengths; copies utm → utm_source when missing.
 */
export function sanitizePremiumAttribution(input: unknown): PremiumAttribution {
  if (input === null || input === undefined) return {};
  if (typeof input !== "object" || Array.isArray(input)) return {};

  const source = input as Record<string, unknown>;
  const out: Record<string, string | boolean> = {};

  for (const key of ATTRIBUTION_STRING_KEYS) {
    const raw = source[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    out[key] = clip(trimmed, key === "landingPath" ? 120 : 80);
  }

  if (typeof source["omitFromCampaignReport"] === "boolean") {
    out["omitFromCampaignReport"] = source["omitFromCampaignReport"];
  }

  if (typeof out["utm"] === "string" && !out["utm_source"]) {
    out["utm_source"] = out["utm"];
  }

  return out as PremiumAttribution;
}

export function premiumAttributionJson(attribution: PremiumAttribution): string {
  return JSON.stringify(sanitizePremiumAttribution(attribution));
}
