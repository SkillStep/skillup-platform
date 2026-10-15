"use client";

import { BrandMark } from "@skillup/ui";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import discoveryStyles from "../discovery.module.css";
import styles from "./admin.module.css";

const ADMIN_TABS = [
  { label: "Overview", href: "/en/admin" },
  { label: "Summary", href: "/en/admin/premium?tab=summary" },
  { label: "Campaign", href: "/en/admin/premium?tab=campaign" },
  { label: "Payments", href: "/en/admin/premium?tab=payments" },
  { label: "Memberships", href: "/en/admin/premium?tab=memberships" },
  { label: "Recurring", href: "/en/admin/premium?tab=recurring" },
  { label: "Reconciliation", href: "/en/admin/premium?tab=reconciliation" },
  { label: "Plans", href: "/en/admin/premium?tab=plans" },
  { label: "Exports", href: "/en/admin/premium?tab=exports" },
  { label: "Manual grant", href: "/en/admin/premium/manual-grant" },
] as const;

export function AdminHeader(): ReactNode {
  const [busy, setBusy] = useState(false);

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } catch {
      // Still clear the local view even if the network call fails.
    } finally {
      window.location.assign("/en/admin/sign-in");
    }
  }

  return (
    <header className={discoveryStyles["siteHeader"]}>
      <Link
        className={discoveryStyles["brandLink"]}
        href="/en/admin"
        aria-label="SkillUp admin home"
      >
        <BrandMark className="brand-mark" />
      </Link>

      <nav
        className={`${discoveryStyles["desktopNav"]} ${styles["adminNav"]}`}
        aria-label="Admin navigation"
      >
        {ADMIN_TABS.map((tab) => (
          <Link key={tab.href} className={styles["adminNavTextLink"]} href={tab.href}>
            {tab.label}
          </Link>
        ))}
        <button
          type="button"
          className={styles["adminNavLink"]}
          onClick={() => void logout()}
          disabled={busy}
        >
          {busy ? "Signing out…" : "Logout"}
        </button>
      </nav>

      <details className={discoveryStyles["mobileMenu"]}>
        <summary aria-label="Open navigation">Menu</summary>
        <nav aria-label="Admin mobile navigation">
          {ADMIN_TABS.map((tab) => (
            <Link key={tab.href} href={tab.href}>
              {tab.label}
            </Link>
          ))}
          <button type="button" onClick={() => void logout()} disabled={busy}>
            {busy ? "Signing out…" : "Logout"}
          </button>
        </nav>
      </details>
    </header>
  );
}
