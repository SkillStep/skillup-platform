"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ReactElement } from "react";

/**
 * Premium always opens package selection so both plans stay visible.
 * Purchased plans show Current Plan on /en/pricing.
 */
export function PremiumNavLink({
  children = "Premium",
  className,
}: Readonly<{
  children?: string;
  className?: string;
}>): ReactElement {
  return (
    <Link className={className} href={"/en/pricing" as Route}>
      {children}
    </Link>
  );
}
