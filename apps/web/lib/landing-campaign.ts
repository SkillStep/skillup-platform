export type LandingCampaign = Readonly<{
  utm: string;
  package: string;
  parameter: string;
}>;

export const DEFAULT_LANDING_CAMPAIGN: LandingCampaign = {
  utm: "M",
  package: "1",
  parameter: "premium",
};

const PACKAGE_TO_PLAN: Readonly<Record<string, "premium-monthly" | "premium-yearly">> = {
  "1": "premium-monthly",
  "2": "premium-yearly",
};

export function normalizeLandingCampaign(
  input: Readonly<Partial<Record<"utm" | "package" | "parameter", string | string[] | undefined>>>,
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
  };
}

export function planCodeForPackage(packageId: string): "premium-monthly" | "premium-yearly" {
  return PACKAGE_TO_PLAN[packageId] ?? "premium-monthly";
}

export function buildLandingPath(campaign: LandingCampaign = DEFAULT_LANDING_CAMPAIGN): string {
  const params = new URLSearchParams({
    utm: campaign.utm,
    package: campaign.package,
    parameter: campaign.parameter,
  });
  return `/landing?${params.toString()}`;
}
