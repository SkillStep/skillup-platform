import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminHeader } from "../admin-shell";
import styles from "../admin.module.css";
import { PremiumAuthBoundary } from "../premium/premium-auth-boundary";
import { CourseDraftsConsole } from "./course-drafts-console";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SkillUp course draft review queue",
  description: "Private nonpublished course authoring progress and human review queue.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function CourseDraftsPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <>
      <AdminHeader />
      <main className={styles["main"]}>
        <header className={styles["header"]}>
          <p className="eyebrow">Private editorial operations</p>
          <h1>Course drafts awaiting review</h1>
          <p>
            This queue lists imported but unpublished learning content. It does not approve, publish
            or promise access to any unfinished course. Real subject editors and an authorized
            publisher must review each immutable version before release.
          </p>
        </header>
        <PremiumAuthBoundary>
          <CourseDraftsConsole />
        </PremiumAuthBoundary>
      </main>
    </>
  );
}
