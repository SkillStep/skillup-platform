import { canonicalUrl } from "@skillup/discoverability";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { publicSkill, publicSkills } from "../../../../lib/public-catalog";
import { Breadcrumbs, JsonLd, PublicFooter, PublicHeader } from "../../discovery-shell";
import styles from "../../discovery.module.css";

type PageProps = Readonly<{
  params: Promise<{ locale: string; slug: string }>;
}>;

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return publicSkills.map((skill) => ({ locale: "en", slug: skill.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (locale !== "en") return {};
  const skill = publicSkill(slug);
  if (!skill) return {};

  const url = canonicalUrl(publicAppUrl, "en", `/skills/${skill.slug}`);
  const title = skill.title;
  const description = skill.summary;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title, description, url, siteName: "SkillUp", locale: "en_PK" },
    twitter: { card: "summary", title, description },
  };
}

export default async function SkillPage({ params }: PageProps) {
  const { locale, slug } = await params;
  if (locale !== "en") notFound();
  const skill = publicSkill(slug);
  if (!skill) notFound();

  const homeUrl = canonicalUrl(publicAppUrl, "en");
  const skillsUrl = canonicalUrl(publicAppUrl, "en", "/skills");
  const skillUrl = canonicalUrl(publicAppUrl, "en", `/skills/${skill.slug}`);

  return (
    <>
      <PublicHeader />
      <main className={styles["page"]}>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/en" },
            { label: "Skills", href: "/en/skills" },
            { label: skill.title },
          ]}
        />

        <section className={styles["detailHero"]} aria-labelledby="skill-title">
          <span
            className={`${styles["status"]} ${
              skill.status === "pilot" ? styles["statusPilot"] : styles["statusPlanned"]
            }`}
          >
            {skill.status === "pilot" ? "Reviewed pilot" : "Reviewed launch path"}
          </span>
          <h1 id="skill-title">{skill.title}</h1>
          <p className={styles["detailSummary"]}>{skill.summary}</p>
          <div className={styles["detailMeta"]}>
            <span>English launch content</span>
            <span>{skill.reviewCadence}</span>
          </div>
          <div className={styles["cardLinks"]}>
            <Link className={styles["primaryLink"]} href={`/en/paths/${skill.slug}`}>
              View learning path
            </Link>
            <Link className={styles["secondaryLink"]} href={`/en/learn/${skill.levelId}`}>
              Start reviewed practice
            </Link>
          </div>
        </section>

        <div className={styles["contentGrid"]}>
          <section className={styles["outcomeCard"]} aria-labelledby="outcomes-title">
            <h2 id="outcomes-title">What you will practice</h2>
            <ul>
              {skill.outcomes.map((outcome) => (
                <li key={outcome}>{outcome}</li>
              ))}
            </ul>
          </section>

          <section className={styles["contentCard"]} aria-labelledby="approach-title">
            <h2 id="approach-title">How SkillUp approaches this skill</h2>
            <p>
              Short challenges focus on realistic decisions, useful explanations and visible
              progress. Published learning always references the exact reviewed content version
              presented to the learner.
            </p>
            {skill.editorialNote ? (
              <p>
                <strong>Editorial boundary:</strong> {skill.editorialNote}
              </p>
            ) : null}
          </section>
        </div>

        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "LearningResource",
            name: skill.title,
            description: skill.summary,
            url: skillUrl,
            inLanguage: "en-PK",
            educationalUse: "Practice",
            learningResourceType: "Skill overview",
            teaches: skill.outcomes,
            isPartOf: {
              "@type": "WebSite",
              name: "SkillUp",
              url: homeUrl,
            },
          }}
        />
        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
              { "@type": "ListItem", position: 2, name: "Skills", item: skillsUrl },
              { "@type": "ListItem", position: 3, name: skill.title, item: skillUrl },
            ],
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
