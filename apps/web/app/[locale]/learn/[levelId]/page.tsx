import { BrandMark } from "@skillup/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LevelPlayer } from "./level-player";
import styles from "./level-player.module.css";

type PageProps = Readonly<{
  params: Promise<{ locale: string; levelId: string }>;
}>;

export const metadata: Metadata = {
  title: "Practice level",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default async function PlayLevelPage({ params }: PageProps) {
  const { locale, levelId } = await params;
  if (locale !== "en") notFound();

  return (
    <main className={styles["shell"]}>
      <header className={styles["header"]}>
        <Link className={styles["homeLink"]} href="/en" aria-label="SkillUp home">
          <BrandMark className="brand-mark" />
        </Link>
        <Link className={styles["exitLink"]} href="/en">
          Exit level
        </Link>
      </header>

      <LevelPlayer levelId={levelId} locale="en" />
    </main>
  );
}
