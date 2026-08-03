import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter, PublicHeader } from "../../discovery-shell";
import styles from "./premium.module.css";
import { PremiumWorkspace } from "./premium-workspace";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SkillUp Premium administration",
  description:
    "Private SkillUp Premium subscriptions, payments, recurring-customer and finance reporting workspace.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function PremiumAdminPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <>
      <PublicHeader />
      <main className={styles["main"]}>
        <header className={styles["header"]}>
          <p className="eyebrow">Private Premium operations</p>
          <h1>Measure and operate paid membership from one authority.</h1>
          <p>
            Collections, refunds, recurring customers, MRR, memberships and exports come from the
            backend payment and entitlement authority. Browser events and visible table rows never
            determine finance totals.
          </p>
        </header>
        <PremiumWorkspace />
      </main>
      <PublicFooter />
    </>
  );
}
