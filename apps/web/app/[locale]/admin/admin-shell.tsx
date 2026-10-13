import { BrandMark } from "@skillup/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import discoveryStyles from "../discovery.module.css";
import styles from "./admin.module.css";

const CAMPAIGN_HREF = "/en/admin/premium?tab=campaign";

export function AdminHeader(): ReactNode {
  return (
    <header className={discoveryStyles["siteHeader"]}>
      <Link className={discoveryStyles["brandLink"]} href="/en/admin" aria-label="SkillUp admin home">
        <BrandMark className="brand-mark" />
      </Link>

      <nav className={`${discoveryStyles["desktopNav"]} ${styles["adminNav"]}`} aria-label="Admin navigation">
        <Link className={styles["adminNavLink"]} href={CAMPAIGN_HREF}>
          Campaign
        </Link>
      </nav>

      <details className={discoveryStyles["mobileMenu"]}>
        <summary aria-label="Open navigation">Menu</summary>
        <nav aria-label="Admin mobile navigation">
          <Link href={CAMPAIGN_HREF}>Campaign</Link>
        </nav>
      </details>
    </header>
  );
}
