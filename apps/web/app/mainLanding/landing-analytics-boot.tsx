"use client";

import { useEffect } from "react";

import type { LandingCampaign } from "../../lib/landing-campaign";
import {
  buildLandingAnalyticsContext,
  trackLandingView,
} from "../../lib/landing-analytics";
import { postPremiumFunnelEvent } from "../../lib/premium-funnel";

export function LandingAnalyticsBoot({
  campaign,
  landing,
}: Readonly<{
  campaign: LandingCampaign;
  landing: string;
}>): null {
  useEffect(() => {
    trackLandingView(buildLandingAnalyticsContext(campaign, { landing }));
    void postPremiumFunnelEvent({
      event: "paywall_viewed",
      campaign,
      landing,
    });
  }, [campaign, landing]);

  return null;
}
