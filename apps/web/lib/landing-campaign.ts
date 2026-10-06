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

export function buildLandingPath(campaign: LandingCampaign = DEFAULT_LANDING_CAMPAIGN): string {
  const params = new URLSearchParams({
    utm: campaign.utm,
    package: campaign.package,
    parameter: campaign.parameter,
    payment: campaign.payment,
  });
  return `/mainLanding?${params.toString()}`;
}
