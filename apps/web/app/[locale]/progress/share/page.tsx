import { BrandMark } from "@skillup/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AchievementShare } from "./achievement-share";
import styles from "./share.module.css";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const metadata: Metadata = {
  title: "Share a verified achievement",
  description: "Generate a privacy-safe card from a server-verified SkillUp achievement.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AchievementSharePage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <main className={styles["shell"]}>
      <header className={styles["header"]}>
        <Link href="/en" aria-label="SkillUp home">
          <BrandMark className="brand-mark" />
        </Link>
        <Link href="/en/progress">Return to progress</Link>
      </header>
      <AchievementShare />
    </main>
  );
}
