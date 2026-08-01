import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter, PublicHeader } from "../discovery-shell";
import { AccountControls } from "./account-controls";
import styles from "./account.module.css";
import { MembershipAccount } from "./membership-account";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your SkillUp account",
  description:
    "Manage your private SkillUp membership, sessions, privacy choices, export and account deletion.",
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
          <h1>Your account, privacy and membership</h1>
          <p>
            Review server-authoritative access, payment references, devices, sharing choices,
            policy evidence, export and deletion. This page is never indexed or placed in the
            public offline cache.
          </p>
        </header>
        <MembershipAccount />
        <AccountControls />
      </main>
      <PublicFooter />
    </>
  );
}
