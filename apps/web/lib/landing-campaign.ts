export type LandingCampaign = Readonly<{
  utm: string;
  package: string;
  parameter: string;
  payment: string;
}>;

/** Client-approved default Premium landing URL query. */
export const DEFAULT_LANDING_CAMPAIGN: LandingCampaign = {
  utm: "D",
  package: "default",
  parameter: "default",
  payment: "jazzcash",
};

/** Client 20% off yearly campaign landing (`/landing2`). */
export const LANDING2_CAMPAIGN: LandingCampaign = {
  utm: "T",
  package: "2",
  parameter: "20percentoff",
  payment: "jazzcash",
};

const PACKAGE_TO_PLAN: Readonly<Record<string, "premium-monthly" | "premium-yearly">> = {
  default: "premium-monthly",
  "1": "premium-monthly",
  monthly: "premium-monthly",
  "2": "premium-yearly",
  yearly: "premium-yearly",
};

export function normalizeLandingCampaign(
  input: Readonly<
    Partial<Record<"utm" | "package" | "parameter" | "payment", string | string[] | undefined>>
  >,
): LandingCampaign {
  const read = (key: keyof LandingCampaign): string => {
    const value = input[key];
    const raw = Array.isArray(value) ? value[0] : value;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed || DEFAULT_LANDING_CAMPAIGN[key];
  };

  return {
    utm: read("utm"),
    package: read("package"),
    parameter: read("parameter"),
    payment: read("payment"),
  };
}

export function planCodeForPackage(packageId: string): "premium-monthly" | "premium-yearly" {
  return PACKAGE_TO_PLAN[packageId.toLowerCase()] ?? "premium-monthly";
}

export function buildLandingQuery(campaign: LandingCampaign): string {
  const params = new URLSearchParams({
    utm: campaign.utm,
    package: campaign.package,
    parameter: campaign.parameter,
    payment: campaign.payment,
  });
  return params.toString();
}

export function buildLandingPath(campaign: LandingCampaign = DEFAULT_LANDING_CAMPAIGN): string {
  return `/mainLanding?${buildLandingQuery(campaign)}`;
}

export function buildLanding2Path(campaign: LandingCampaign = LANDING2_CAMPAIGN): string {
  return `/landing2?${buildLandingQuery(campaign)}`;
}

export function normalizeLanding2Campaign(
  input: Readonly<
    Partial<Record<"utm" | "package" | "parameter" | "payment", string | string[] | undefined>>
  >,
): LandingCampaign {
  const read = (key: keyof LandingCampaign): string => {
    const value = input[key];
    const raw = Array.isArray(value) ? value[0] : value;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed || LANDING2_CAMPAIGN[key];
  };

  return {
    utm: read("utm"),
    package: read("package"),
    parameter: read("parameter"),
    payment: read("payment"),
  };
}
