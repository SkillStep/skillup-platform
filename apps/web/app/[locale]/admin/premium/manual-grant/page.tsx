import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter, PublicHeader } from "../../../discovery-shell";
import styles from "../premium.module.css";
import { ManualGrantForm } from "./manual-grant-form";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SkillUp manual Premium grant",
  description: "Private audited temporary Premium grant operation.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function ManualGrantPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <>
      <PublicHeader />
      <main className={styles["main"]}>
        <header className={styles["header"]}>
          <p className="eyebrow">Private Premium operation</p>
          <h1>Create an audited temporary access grant.</h1>
          <p>
            Manual grants are visibly non-paid, never contribute to revenue, require an approved
            active plan version, and cannot overlap another active or grace entitlement.
          </p>
        </header>
        <ManualGrantForm />
      </main>
      <PublicFooter />
    </>
  );
}
