import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicFooter, PublicHeader } from "../discovery-shell";
import styles from "./admin.module.css";
import { GovernanceConsole } from "./governance-console";
import { OperationsConsole } from "./operations-console";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SkillUp operations console",
  description:
    "Private SkillUp content, AI review, moderation, access, support, payment and audit operations.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <>
      <PublicHeader />
      <main className={styles["main"]}>
        <header className={styles["header"]}>
          <p className="eyebrow">Private operations</p>
          <h1>Review, reconcile and publish safely.</h1>
          <p>
            Every action on this page is re-authorized by the API and written to append-only audit
            evidence. Each operator sees only the workflows allowed by their current server-side
            role; the browser cannot grant roles, premium access, payment outcomes or publication
            status.
          </p>
          <p>
            <Link href="/en/admin/premium">
              Open Premium subscriptions, finance reporting and recurring-customer operations
            </Link>
          </p>
        </header>
        <OperationsConsole />
        <GovernanceConsole />
      </main>
      <PublicFooter />
    </>
  );
}
