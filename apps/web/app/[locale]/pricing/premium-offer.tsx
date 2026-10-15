"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { buildLandingPath, DEFAULT_LANDING_CAMPAIGN } from "../../../lib/landing-campaign";
import styles from "./pricing.module.css";

type Plan = Readonly<{
  code: "premium-monthly" | "premium-yearly";
  name: string;
  amountMinor: number;
  currency: "PKR";
  billingPeriod: "month" | "year";
  capabilities: readonly string[];
  checkoutAvailable: boolean;
  checkoutMode?: "jazzcash_wallet_link" | "jazzcash_v11" | "premium_bypass" | null;
}>;

type Entitlement = Readonly<{
  planCode: string;
  status: string;
}>;

const capabilityLabels: Readonly<Record<string, string>> = {
  expanded_levels: "Expanded learning levels",
  detailed_progress: "Detailed progress insights",
  advanced_ai_challenges: "Advanced reviewed AI-assisted challenges",
  premium_avatars: "Premium profile avatars",
};

function formatPrice(amountMinor: number): string {
  // Fixed locale avoids Node vs browser Intl hydration mismatches.
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function packageIdForPlan(plan: Plan): string {
  return plan.code === "premium-yearly" || plan.billingPeriod === "year" ? "2" : "default";
}

function isCurrentPlan(plan: Plan, entitlement: Entitlement | null): boolean {
  if (!entitlement || !["active", "grace"].includes(entitlement.status)) return false;
  return entitlement.planCode === plan.code;
}

function badgeLabel(plan: Plan, current: boolean): string {
  if (current) return "Current Plan";
  return plan.billingPeriod === "year" ? "Coming soon" : "Flexible";
}

export function PremiumOffer({ plans }: Readonly<{ plans: readonly Plan[] }>) {
  const [ready, setReady] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  useEffect(() => {
    setReady(true);
    const controller = new AbortController();
    void fetch("/api/v1/commercial/events/offer", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface: "public_pricing" }),
    }).catch(() => undefined);

    void fetch("/api/v1/commercial/account", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as Readonly<{ entitlement?: Entitlement | null }>;
        setEntitlement(body.entitlement ?? null);
      })
      .catch(() => undefined);

    const params = new URLSearchParams(window.location.search);
    if (params.get("unsubscribed") === "1") {
      setUnsubscribed(true);
      params.delete("unsubscribed");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", next);
    }

    return () => controller.abort();
  }, []);

  if (plans.length === 0) {
    return (
      <p className={styles["message"]} role="alert">
        Premium plans are temporarily unavailable.
      </p>
    );
  }

  return (
    <>
      {ready && unsubscribed ? (
        <p className={styles["message"]} role="status">
          You unsubscribed successfully. Premium features are locked. Select a plan below to
          subscribe again.
        </p>
      ) : null}
      <div className={styles["grid"]}>
        {plans.map((plan) => {
          const yearly = plan.billingPeriod === "year";
          // Entitlement is client-fetched; keep SSR and first client paint identical.
          const current = ready ? isCurrentPlan(plan, entitlement) : false;
          const landingHref = buildLandingPath({
            ...DEFAULT_LANDING_CAMPAIGN,
            package: packageIdForPlan(plan),
          });

          return (
            <article
              className={`${styles["card"]} ${yearly ? styles["featured"] : ""}`}
              key={plan.code}
            >
              <span
                className={`${styles["badge"]} ${current ? styles["currentPlanBadge"] : ""}`.trim()}
              >
                {badgeLabel(plan, current)}
              </span>
              <h2>{plan.name}</h2>
              <p className={styles["price"]}>
                <strong>{formatPrice(plan.amountMinor)}</strong>
                <span>/{plan.billingPeriod}</span>
              </p>
              {yearly && !current ? (
                <p className={styles["saving"]}>Yearly Premium is coming soon.</p>
              ) : null}
              <ul className={styles["features"]}>
                {plan.capabilities.map((capability) => (
                  <li key={capability}>{capabilityLabels[capability] ?? capability}</li>
                ))}
              </ul>

              {current ? (
                <button
                  type="button"
                  className={`${styles["action"]} ${styles["actionDisabled"]}`}
                  disabled
                >
                  Current Plan
                </button>
              ) : yearly ? (
                <button
                  type="button"
                  className={`${styles["action"]} ${styles["actionDisabled"]}`}
                  disabled
                >
                  Coming soon
                </button>
              ) : (
                <Link className={styles["action"]} href={landingHref as Route}>
                  Select Plan
                </Link>
              )}
              <p className={styles["note"]}>
                {current
                  ? "This is your active SkillUp Premium plan."
                  : yearly
                    ? "Yearly billing will open here when the campaign is ready."
                    : "Continue to enter your JazzCash number and complete Subscribe Now on the Premium landing page. SkillUp grants Premium only after a verified JazzCash response."}
              </p>
            </article>
          );
        })}
      </div>
    </>
  );
}
