import type { Route } from "next";
import { redirect } from "next/navigation";

import { buildLandingPath, normalizeLandingCampaign } from "../../lib/landing-campaign";

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function MainLanding2RedirectPage({
  searchParams,
}: PageProps): Promise<never> {
  const campaign = normalizeLandingCampaign(await searchParams);
  redirect(buildLandingPath(campaign) as Route);
}
