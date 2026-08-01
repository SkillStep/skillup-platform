import { BrandMark } from "@skillup/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProgressDashboard } from "./progress-dashboard";
import styles from "./progress.module.css";
import { RecommendationCard } from "./recommendation-card";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const metadata: Metadata = {
  title: "Your learning progress",
  description:
    "Review your private SkillUp progress, verified points, streak, achievements and next learning step.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function ProgressPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <main className={styles["shell"]}>
      <header className={styles["header"]}>
        <Link className={styles["homeLink"]} href="/en" aria-label="SkillUp home">
          <BrandMark className="brand-mark" />
        </Link>
        <nav aria-label="Progress actions">
          <Link className={styles["backLink"]} href="/en/progress/share">
            Share achievement
          </Link>
          <Link className={styles["backLink"]} href="/en">
            Return home
          </Link>
        </nav>
      </header>
      <RecommendationCard locale="en" />
      <ProgressDashboard locale="en" />
    </main>
  );
}
