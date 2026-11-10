import { BrandMark } from "@skillup/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import styles from "../account-flow.module.css";
import { UnsubscribeForm } from "./unsubscribe-form";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const metadata: Metadata = {
  title: "Unsubscribe from Premium",
  description:
    "Cancel SkillUp Premium with the JazzCash mobile number used at checkout. Premium locks immediately after confirmation.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function UnsubscribePage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <main className={styles["shell"]}>
      <header className={styles["header"]}>
        <Link className={styles["homeLink"]} href="/en" aria-label="SkillUp home">
          <BrandMark className="brand-mark" />
        </Link>
        <Link className={styles["backLink"]} href="/en">
          Back to home
        </Link>
      </header>

      <div className={styles["layout"]}>
        <section className={styles["intro"]} aria-labelledby="unsubscribe-title">
          <p className={styles["eyebrow"]}>Premium billing</p>
          <h1 className={styles["title"]} id="unsubscribe-title">
            Cancel Premium with your JazzCash number.
          </h1>
          <p className={styles["summary"]}>
            Enter the JazzCash mobile number from checkout. If that number has an active SkillUp
            subscription, you will confirm before Premium is cancelled.
          </p>
          <ul className={styles["commitments"]} aria-label="Unsubscribe commitments">
            <li>Works for guest pay-first checkouts (no sign-in required)</li>
            <li>Confirmation required before cancellation</li>
            <li>Premium features lock immediately after a successful unsubscribe</li>
          </ul>
        </section>

        <UnsubscribeForm />
      </div>
    </main>
  );
}
