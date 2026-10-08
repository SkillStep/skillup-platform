"use client";

import type { Route } from "next";
import Link from "next/link";
import { type ReactElement, useEffect, useState } from "react";

import { withReturnTo } from "../../../lib/return-to";
import styles from "../account/account.module.css";

type Entitlement = Readonly<{
  id: string;
  planCode: string;
  status: "active" | "grace" | "expired" | "cancelled" | "refunded" | "revoked";
  startsAt: string;
  endsAt: string;
  graceEndsAt: string | null;
  capabilities: readonly string[];
}>;

const capabilityLabels: Readonly<Record<string, string>> = {
  expanded_levels: "Expanded learning levels",
  detailed_progress: "Detailed progress insights",
  advanced_ai_challenges: "Advanced reviewed AI-assisted challenges",
  premium_avatars: "Premium profile avatars",
};

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

export function PremiumFeatures(): ReactElement {
  const [loading, setLoading] = useState(true);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/v1/commercial/account", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.assign(withReturnTo("/en/sign-in", "/en/premium"));
          return;
        }
        if (!response.ok) {
          setError("Premium status could not be loaded. Try again in a moment.");
          setLoading(false);
          return;
        }
        const body = (await response.json()) as Readonly<{ entitlement?: Entitlement | null }>;
        const next = body.entitlement ?? null;
        const active = next && (next.status === "active" || next.status === "grace");
        if (!active) {
          window.location.assign("/en/pricing");
          return;
        }
        setEntitlement(next);
        setLoading(false);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Premium status could not be loaded. Try again in a moment.",
        );
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <section className={styles["panel"]} aria-busy="true">
        <p>Checking Premium access…</p>
      </section>
    );
  }

  if (error || !entitlement) {
    return (
      <section className={styles["panel"]} role="alert">
        <p>{error ?? "Premium Features are not available on this account yet."}</p>
        <p>
          <Link className={styles["button"]} href={"/en/pricing" as Route}>
            View Premium packages
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className={styles["panel"]} aria-labelledby="premium-features-heading">
      <div className={styles["status"]}>
        <div>
          <strong id="premium-features-heading">Premium Status: Active</strong>
          <span>
            {entitlement.planCode.replaceAll("-", " ")} through{" "}
            {dateLabel(entitlement.graceEndsAt ?? entitlement.endsAt)}
          </span>
        </div>
      </div>

      <h2>Your unlocked features</h2>
      <ul className={styles["capabilities"]}>
        {entitlement.capabilities.map((capability) => (
          <li key={capability}>{capabilityLabels[capability] ?? capability}</li>
        ))}
      </ul>

      <div className={styles["actions"]}>
        <Link className={styles["button"]} href={"/en/skills" as Route}>
          Continue learning
        </Link>
        <Link className={styles["button"]} href={"/en/progress" as Route}>
          Your progress
        </Link>
        <Link className={styles["button"]} href={"/en/account" as Route}>
          User Profile
        </Link>
      </div>
    </section>
  );
}
