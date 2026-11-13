import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminHeader } from "../admin-shell";
import styles from "../admin.module.css";
import { PremiumAuthBoundary } from "../premium/premium-auth-boundary";
import { CourseEditorialConsole } from "./course-editorial-console";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "SkillUp human course approval",
  description: "Protected editorial sign-offs, version history and authorized course releases.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function CourseEditorialPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();
  return (
    <>
      <AdminHeader />
      <main className={styles["main"]}>
        <header className={styles["header"]}>
          <p className="eyebrow">Private editorial administration</p>
          <h1>Course review and publishing</h1>
          <p>
            Separate human approval, frozen versions, complete audit evidence and reversible release
            control.
          </p>
        </header>
        <PremiumAuthBoundary>
          <CourseEditorialConsole />
        </PremiumAuthBoundary>
      </main>
    </>
  );
}
