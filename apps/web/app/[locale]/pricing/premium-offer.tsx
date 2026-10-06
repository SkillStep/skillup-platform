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

const capabilityLabels: Readonly<Record<string, string>> = {
  expanded_levels: "Expanded learning levels",
  detailed_progress: "Detailed progress insights",
  advanced_ai_challenges: "Advanced reviewed AI-assisted challenges",
  premium_avatars: "Premium profile avatars",
};

function formatPrice(amountMinor: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function packageIdForPlan(plan: Plan): string {
  return plan.code === "premium-yearly" || plan.billingPeriod === "year" ? "2" : "default";
}

export function PremiumOffer({ plans }: Readonly<{ plans: readonly Plan[] }>) {
  const [unsubscribed, setUnsubscribed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/commercial/events/offer", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface: "public_pricing" }),
      signal: controller.signal,
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("unsubscribed") !== "1") return;
    setUnsubscribed(true);
    params.delete("unsubscribed");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
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
      {unsubscribed ? (
        <p className={styles["message"]} role="status">
          You unsubscribed successfully. Premium features are locked. Select a plan below to
          subscribe again.
        </p>
      ) : null}
      <div className={styles["grid"]}>
        {plans.map((plan) => {
          const yearly = plan.billingPeriod === "year";
          const landingHref = buildLandingPath({
            ...DEFAULT_LANDING_CAMPAIGN,
            package: packageIdForPlan(plan),
          });

          return (
            <article
              className={`${styles["card"]} ${yearly ? styles["featured"] : ""}`}
              key={plan.code}
            >
              <span className={styles["badge"]}>{yearly ? "Best value" : "Flexible"}</span>
              <h2>{plan.name}</h2>
              <p className={styles["price"]}>
                <strong>{formatPrice(plan.amountMinor)}</strong>
                <span>/{plan.billingPeriod}</span>
              </p>
              {yearly ? <p className={styles["saving"]}>Save PKR 2,189 versus monthly.</p> : null}
              <ul className={styles["features"]}>
                {plan.capabilities.map((capability) => (
                  <li key={capability}>{capabilityLabels[capability] ?? capability}</li>
                ))}
              </ul>

              <Link className={styles["action"]} href={landingHref as Route}>
                Select Plan
              </Link>
              <p className={styles["note"]}>
                Continue to enter your JazzCash number and complete Subscribe Now on the Premium
                landing page. SkillUp grants Premium only after a verified JazzCash response.
              </p>
            </article>
          );
        })}
      </div>
    </>
  );
}
