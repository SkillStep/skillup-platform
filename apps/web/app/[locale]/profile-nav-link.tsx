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
 * User Profile nav entry — only after sign-in.
 * Shows a Premium badge when the learner has an active/grace entitlement,
 * or after JazzCash pay-first unlock while signed in.
 */
export function ProfileNavLink(): ReactElement | null {
  const [signedIn, setSignedIn] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const session = await fetch("/api/v1/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!session.ok) {
          setSignedIn(false);
          setShowPremium(false);
          setReady(true);
          return;
        }
        setSignedIn(true);

        let premium = hasPremiumUnlockedFlag();
        const response = await fetch("/api/v1/commercial/account", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const body = (await response.json()) as Readonly<{ entitlement?: Entitlement | null }>;
          const status = body.entitlement?.status;
          premium = status === "active" || status === "grace" || premium;
        }
        setShowPremium(premium);
      } catch {
        // Fail closed: hide Profile until session is confirmed.
        setSignedIn(false);
        setShowPremium(false);
      } finally {
        setReady(true);
      }
    })();
    return () => controller.abort();
  }, []);

  if (!ready || !signedIn) {
    return null;
  }

  return (
    <Link className={styles["profileNavLink"]} href={"/en/account" as Route}>
      <span>User Profile</span>
      {showPremium ? <span className={styles["premiumTag"]}>Premium</span> : null}
    </Link>
  );
}
