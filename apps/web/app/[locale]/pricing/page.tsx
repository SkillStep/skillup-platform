import { canonicalUrl } from "@skillup/discoverability";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd, PublicFooter, PublicHeader } from "../discovery-shell";
import { PremiumOffer } from "./premium-offer";
import styles from "./pricing.module.css";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

type Plan = Readonly<{
  code: "premium-monthly" | "premium-yearly";
  name: string;
  amountMinor: number;
  currency: "PKR";
  billingPeriod: "month" | "year";
  capabilities: readonly string[];
  checkoutAvailable: boolean;
}>;

type BillingPlan = Readonly<{
  localCode?: "premium-monthly" | "premium-yearly";
  launchReady?: boolean;
}>;

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";
const apiBaseUrl = process.env["API_BASE_URL"] ?? "http://localhost:3001";

const launchPlans: readonly Plan[] = [
  {
    code: "premium-monthly",
    name: "SkillUp Premium Monthly",
    amountMinor: 59_900,
    currency: "PKR",
    billingPeriod: "month",
    capabilities: [
      "expanded_levels",
      "detailed_progress",
      "advanced_ai_challenges",
      "premium_avatars",
    ],
    checkoutAvailable: false,
  },
  {
    code: "premium-yearly",
    name: "SkillUp Premium Yearly",
    amountMinor: 499_900,
    currency: "PKR",
    billingPeriod: "year",
    capabilities: [
      "expanded_levels",
      "detailed_progress",
      "advanced_ai_challenges",
      "premium_avatars",
    ],
    checkoutAvailable: false,
  },
];

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en") return {};
  return {
    title: "SkillUp Premium pricing",
    description:
      "Compare SkillUp Premium monthly and yearly plans. The free learning experience remains useful, while premium expands levels and progress insights.",
    alternates: { canonical: canonicalUrl(publicAppUrl, "en", "pricing") },
    openGraph: {
      title: "SkillUp Premium pricing",
      description: "Monthly PKR 599 or yearly PKR 4,999, with server-verified JazzCash billing.",
      type: "website",
      url: canonicalUrl(publicAppUrl, "en", "pricing"),
    },
  };
}

async function loadCommercialPlans(): Promise<readonly Plan[]> {
  try {
    const response = await fetch(new URL("/v1/commercial/plans", apiBaseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return launchPlans;
    const body = (await response.json()) as Readonly<{ plans?: readonly Plan[] }>;
    if (!Array.isArray(body.plans) || body.plans.length !== 2) return launchPlans;
    return body.plans;
  } catch {
    return launchPlans;
  }
}

async function paymentServiceAvailability(): Promise<ReadonlySet<Plan["code"]>> {
  try {
    const response = await fetch(new URL("/v1/billing/plans", apiBaseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return new Set();
    const plans = (await response.json()) as readonly BillingPlan[];
    if (!Array.isArray(plans)) return new Set();

    return new Set(
      plans
        .filter(
          (plan): plan is BillingPlan & { localCode: Plan["code"]; launchReady: true } =>
            plan.launchReady === true &&
            (plan.localCode === "premium-monthly" || plan.localCode === "premium-yearly"),
        )
        .map((plan) => plan.localCode),
    );
  } catch {
    return new Set();
  }
}

async function loadPlans(): Promise<readonly Plan[]> {
  const [commercialPlans, externalAvailable] = await Promise.all([
    loadCommercialPlans(),
    paymentServiceAvailability(),
  ]);
  return commercialPlans.map((plan) => ({
    ...plan,
    checkoutAvailable: plan.checkoutAvailable || externalAvailable.has(plan.code),
  }));
}

export default async function PricingPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();
  const plans = await loadPlans();

  return (
    <>
      <PublicHeader />
      <main className={styles["main"]}>
        <header className={styles["hero"]}>
          <p className="eyebrow">Clear, Pakistan-first pricing</p>
          <h1>Learn free. Upgrade when Premium value is clear.</h1>
          <p>
            The free experience includes useful reviewed learning. Premium expands available levels,
            progress insights and approved advanced challenges without erasing your history if a
            plan expires.
          </p>
        </header>

        <PremiumOffer plans={plans} />

        <section className={styles["free"]} aria-labelledby="free-title">
          <h2 id="free-title">The free experience remains meaningful.</h2>
          <p>
            You can create a profile, play reviewed pilot levels, receive explanations, earn points
            and keep progress without purchasing Premium.
          </p>
        </section>

        <section className={styles["policy"]} aria-label="Premium commitments">
          <article>
            <h2>Server-verified access</h2>
            <p>Browser redirects and payment screenshots cannot activate Premium.</p>
          </article>
          <article>
            <h2>Hosted wallet security</h2>
            <p>
              Your JazzCash MPIN is entered only on JazzCash&apos;s hosted page, never in SkillUp.
            </p>
          </article>
          <article>
            <h2>Billing controls</h2>
            <p>
              Subscription cancellation and wallet unlinking are available from your private
              account.
            </p>
          </article>
        </section>
      </main>
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "SkillUp Premium",
          description: "Expanded SkillUp learning levels and progress capabilities.",
          offers: plans.map((plan) => ({
            "@type": "Offer",
            priceCurrency: plan.currency,
            price: (plan.amountMinor / 100).toFixed(0),
            availability: plan.checkoutAvailable
              ? "https://schema.org/InStock"
              : "https://schema.org/PreOrder",
            url: canonicalUrl(publicAppUrl, "en", "pricing"),
          })),
        }}
      />
      <PublicFooter />
    </>
  );
}
