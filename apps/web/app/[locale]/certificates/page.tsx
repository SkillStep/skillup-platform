import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter, PublicHeader } from "../discovery-shell";
import { MyCertificates } from "./my-certificates";
import styles from "./certificates.module.css";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Certificates | SkillUp",
  description: "View your verified skill completion status and certificates.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function CertificatesPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();
  return (
    <>
      <PublicHeader />
      <main className={styles["main"]}>
        <header className={styles["hero"]}>
          <p className={styles["eyebrow"]}>Your learning achievements</p>
          <h1>My Certificates</h1>
          <p>
            See verified completion for each skill. Certificates are available only
            after published challenges, assessments and required human reviews are complete.
          </p>
        </header>
        <MyCertificates />
      </main>
      <PublicFooter />
    </>
  );
}
