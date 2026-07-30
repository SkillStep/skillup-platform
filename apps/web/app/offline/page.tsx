import { BrandMark } from "@skillup/ui";
import type { Metadata } from "next";
import Link from "next/link";

import styles from "../[locale]/discovery.module.css";

export const metadata: Metadata = {
  title: "You are offline",
  description: "Reconnect to continue private SkillUp learning and progress safely.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function OfflinePage() {
  return (
    <main className={styles["page"]}>
      <section className={styles["hero"]} aria-labelledby="offline-title">
        <BrandMark className="brand-mark" />
        <p className={styles["eyebrow"]}>Connection unavailable</p>
        <h1 id="offline-title">You are offline.</h1>
        <p className={styles["heroSummary"]}>
          Previously visited public SkillUp pages may still be available. Sign-in, gameplay,
          progress and account actions always require a secure connection and are never stored in
          the public offline cache.
        </p>
        <div className={styles["cardLinks"]}>
          <Link className={styles["primaryLink"]} href="/en">
            Try the home page
          </Link>
          <Link className={styles["secondaryLink"]} href="/en/skills">
            Try cached skills
          </Link>
        </div>
      </section>
    </main>
  );
}
