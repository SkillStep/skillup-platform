import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter, PublicHeader } from "../discovery-shell";
import styles from "./account.module.css";
import { AccountControls } from "./account-controls";
import { MembershipAccount } from "./membership-account";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "User Profile",
  description:
    "Manage your SkillUp Premium status, subscription, privacy choices, export and account deletion.",
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
          <p className="eyebrow">User Profile</p>
          <h1>Your Premium status and account</h1>
          <p>
            Review Premium access, subscription controls, devices, privacy choices, export and
            deletion. This page is never indexed or placed in the public offline cache.
          </p>
        </header>
        <MembershipAccount />
        <AccountControls />
      </main>
      <PublicFooter />
    </>
  );
}
