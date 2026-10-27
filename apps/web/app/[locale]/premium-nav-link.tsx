"use client";

import type { Route } from "next";
import Link from "next/link";
import { type ReactElement, useEffect, useState } from "react";

type Entitlement = Readonly<{
  status: "active" | "grace" | "expired" | "cancelled" | "refunded" | "revoked";
}>;

/**
 * Premium opens package selection. Hidden while the signed-in learner has an
 * active/grace paid plan; shown again after expiry or cancel.
 */
export function PremiumNavLink({
  children = "Premium",
  className,
}: Readonly<{
  children?: string;
  className?: string;
}>): ReactElement | null {
  const [hidden, setHidden] = useState(false);

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
          setHidden(false);
          return;
        }
        if (!response.ok) return;
        const body = (await response.json()) as Readonly<{ entitlement?: Entitlement | null }>;
        const status = body.entitlement?.status;
        setHidden(status === "active" || status === "grace");
      } catch {
        // Keep the tab visible if entitlement cannot be loaded.
      }
    })();
    return () => controller.abort();
  }, []);

  if (hidden) return null;

  return (
    <Link className={className} href={"/en/pricing" as Route}>
      {children}
    </Link>
  );
}
