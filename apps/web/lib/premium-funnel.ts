import type { LandingCampaign } from "./landing-campaign";
import { planCodeForPackage } from "./landing-campaign";
import { attributionForBilling, type PremiumAttribution } from "./utm-attribution";

export type ClientFunnelEventName = "paywall_viewed" | "plan_selected" | "add_to_cart";

/** Best-effort ops funnel POST. Never throws; does not block checkout. */
export async function postPremiumFunnelEvent(input: Readonly<{
  event: ClientFunnelEventName;
  campaign: LandingCampaign;
  landing: string;
  landingPath?: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}>): Promise<void> {
  try {
    const attribution: PremiumAttribution = attributionForBilling(input.campaign, {
      landing: input.landing,
      ...(input.landingPath ? { landingPath: input.landingPath } : {}),
    });
    await fetch("/api/v1/premium/analytics/events", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: input.event,
        source: "landing",
        client: "web",
        planCode: planCodeForPackage(input.campaign.package),
        attribution,
        metadata: input.metadata ?? {},
      }),
      keepalive: true,
    });
  } catch {
    // Funnel analytics must never interrupt payment.
  }
}
