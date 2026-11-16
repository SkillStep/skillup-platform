import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { previewBySlug } from "../../../../../lib/coming-soon-skills";
import { loadPublishedPublicSkills } from "../../../../../lib/live-catalog";
import styles from "../../../discovery.module.css";
import { Breadcrumbs, PublicFooter, PublicHeader } from "../../../discovery-shell";
import { MotionReveal } from "../../../motion-reveal";

type PageProps = Readonly<{ params: Promise<{ locale: string; slug: string }> }>;

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Upcoming SkillUp learning path",
  description: "A planned SkillUp path. No lessons are yet available for practice.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function UpcomingSkillPage({ params }: PageProps) {
  const { locale, slug } = await params;
  if (locale !== "en") notFound();
  const preview = previewBySlug(slug);
  if (!preview) notFound();

  const published = await loadPublishedPublicSkills();
  const released = published.find(
    (item) => item.slug === preview.slug || preview.publishedAliases.includes(item.slug),
  );
  if (released) redirect(`/en/paths/${released.slug}`);

  return (
    <>
      <PublicHeader />
      <main className={styles["page"]}>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/en" },
            { label: "Skills", href: "/en/skills" },
            { label: preview.title },
          ]}
        />
        <MotionReveal variant="fade-right" durationMs={700}>
          <section className={styles["detailHero"]} aria-labelledby="upcoming-title">
            <span className={`${styles["status"]} ${styles["statusComingSoon"]}`}>Coming soon</span>
            <h1 id="upcoming-title">{preview.title}</h1>
            <p className={styles["detailSummary"]}>{preview.summary}</p>
            <p>
              This is a proposed learning-path outline, not published teaching content. Practice,
              graded challenges and Premium access will appear only after independent editorial
              approval and testing.
            </p>
            <div className={styles["cardLinks"]}>
              <span className={styles["disabledPractice"]}>Start practice unavailable</span>
              <Link className={styles["secondaryLink"]} href="/en/skills">
                Explore available skills
              </Link>
            </div>
          </section>
        </MotionReveal>
        <section className={styles["contentCard"]} aria-labelledby="planned-modules-title">
          <h2 id="planned-modules-title">Proposed learning path</h2>
          <p>These topics are planned. They do not represent playable or completed levels.</p>
          <ol>
            {preview.modules.map((module) => (
              <li key={module}>{module}</li>
            ))}
          </ol>
          <p>
            Availability and free/Premium access will be confirmed once reviewed exercises are
            published. No separate certificate is earned for viewing this page.
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
