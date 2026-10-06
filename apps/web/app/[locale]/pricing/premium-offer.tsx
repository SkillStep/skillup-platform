"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect } from "react";

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

export function PremiumOffer({ plans }: Readonly<{ plans: readonly Plan[] }>) {
  const monthly =
    plans.find((plan) => plan.code === "premium-monthly") ??
    plans.find((plan) => plan.billingPeriod === "month") ??
    null;
  const landingHref = buildLandingPath({
    ...DEFAULT_LANDING_CAMPAIGN,
    package: "1",
  });

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

  if (!monthly) {
    return (
      <p className={styles["message"]} role="alert">
        The monthly Premium package is temporarily unavailable.
      </p>
    );
  }

  return (
    <div className={`${styles["grid"]} ${styles["gridSingle"]}`}>
      <article className={styles["card"]} key={monthly.code}>
        <span className={styles["badge"]}>Monthly</span>
        <h2>{monthly.name}</h2>
        <p className={styles["price"]}>
          <strong>{formatPrice(monthly.amountMinor)}</strong>
          <span>/{monthly.billingPeriod}</span>
        </p>
        <ul className={styles["features"]}>
          {monthly.capabilities.map((capability) => (
            <li key={capability}>{capabilityLabels[capability] ?? capability}</li>
          ))}
        </ul>

        <Link className={styles["action"]} href={landingHref as Route}>
          Select Plan
        </Link>
        <p className={styles["note"]}>
          Continue to enter your JazzCash number and complete Subscribe Now on the Premium landing
          page. SkillUp grants Premium only after a verified JazzCash response.
        </p>
      </article>
    </div>
  );
}
