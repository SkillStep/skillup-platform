"use client";

import type { Route } from "next";
import Link from "next/link";
import { type ReactElement, useEffect, useState } from "react";

import { hasPremiumUnlockedFlag } from "../../lib/premium-unlock";
import styles from "./discovery.module.css";

type Entitlement = Readonly<{
  status: "active" | "grace" | "expired" | "cancelled" | "refunded" | "revoked";
}>;

/**
 * User Profile nav entry. Shows a Premium badge when the learner has an
 * active/grace entitlement, or after JazzCash pay-first unlock (guest).
 */
export function ProfileNavLink(): ReactElement {
  const [showPremium, setShowPremium] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        if (hasPremiumUnlockedFlag()) {
          setShowPremium(true);
        }
        const response = await fetch("/api/v1/commercial/account", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          setShowPremium(hasPremiumUnlockedFlag());
          return;
        }
        if (!response.ok) return;
        const body = (await response.json()) as Readonly<{ entitlement?: Entitlement | null }>;
        const status = body.entitlement?.status;
        setShowPremium(status === "active" || status === "grace" || hasPremiumUnlockedFlag());
      } catch {
        // Keep badge based on local unlock flag if the account call fails.
        setShowPremium(hasPremiumUnlockedFlag());
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <Link className={styles["profileNavLink"]} href={"/en/account" as Route}>
      <span>User Profile</span>
      {showPremium ? <span className={styles["premiumTag"]}>Premium</span> : null}
    </Link>
  );
}
