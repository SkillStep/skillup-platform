import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter, PublicHeader } from "../discovery-shell";
import styles from "./account.module.css";
import { MembershipAccount } from "./membership-account";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your SkillUp membership",
  description: "Review your private SkillUp premium status and payment references.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AccountPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <>
      <PublicHeader />
      <main className={styles["main"]}>
        <header className={styles["header"]}>
          <p className="eyebrow">Private account</p>
          <h1>Your membership and payment status</h1>
          <p>
            This page reads server-authoritative payment and entitlement records. It is never
            indexed or placed in the public offline cache.
          </p>
        </header>
        <MembershipAccount />
      </main>
      <PublicFooter />
    </>
  );
}
