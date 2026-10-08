"use client";

import type { Route } from "next";
import Link from "next/link";
import { type ReactElement, useEffect, useState } from "react";

import { hasPremiumUnlockedFlag } from "../../lib/premium-unlock";

type Entitlement = Readonly<{
  status: "active" | "grace" | "expired" | "cancelled" | "refunded" | "revoked";
}>;

/**
 * Before unlock: Premium → package selection (/en/pricing).
 * After unlock (flag or active entitlement): Premium → Premium Features (/en/premium).
 */
export function PremiumNavLink({
  children = "Premium",
  className,
}: Readonly<{
  children?: string;
  className?: string;
}>): ReactElement {
  const [href, setHref] = useState("/en/pricing");

  useEffect(() => {
    let cancelled = false;

    if (hasPremiumUnlockedFlag()) {
      setHref("/en/premium");
    }

    void (async () => {
      try {
        const response = await fetch("/api/v1/commercial/account", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as Readonly<{ entitlement?: Entitlement | null }>;
        const status = body.entitlement?.status;
        if (status === "active" || status === "grace") {
          setHref("/en/premium");
        }
      } catch {
        // Keep pricing fallback when account status cannot be read.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link className={className} href={href as Route}>
      {children}
    </Link>
  );
}
