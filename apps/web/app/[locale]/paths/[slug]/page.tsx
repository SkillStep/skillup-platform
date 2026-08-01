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

  const url = canonicalUrl(publicAppUrl, "en", `/paths/${skill.slug}`);
  const title = `${skill.title} learning path`;
  const description = `${skill.summary} Review the learning outcomes, modules and practice formats.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title, description, url, siteName: "SkillUp", locale: "en_PK" },
    twitter: { card: "summary", title, description },
  };
}

export default async function PathPage({ params }: PageProps) {
  const { locale, slug } = await params;
  if (locale !== "en") notFound();
  const skill = publicSkill(slug);
  if (!skill) notFound();

  const homeUrl = canonicalUrl(publicAppUrl, "en");
  const skillsUrl = canonicalUrl(publicAppUrl, "en", "/skills");
  const skillUrl = canonicalUrl(publicAppUrl, "en", `/skills/${skill.slug}`);
  const pathUrl = canonicalUrl(publicAppUrl, "en", `/paths/${skill.slug}`);

  const structuredPath = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: `${skill.title} learning path`,
    description: skill.summary,
    url: pathUrl,
    inLanguage: "en-PK",
    provider: { "@type": "Organization", name: "SkillUp", url: homeUrl },
    teaches: skill.outcomes,
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: "Short self-paced practice sessions",
    },
  };

  return (
    <>
      <PublicHeader />
      <main className={styles["page"]}>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/en" },
            { label: "Skills", href: "/en/skills" },
            { label: skill.title, href: `/en/skills/${skill.slug}` },
            { label: "Learning path" },
          ]}
        />

        <section className={styles["detailHero"]} aria-labelledby="path-title">
          <p className={styles["eyebrow"]}>Reviewed learning path</p>
          <h1 id="path-title">{skill.title}</h1>
          <p className={styles["detailSummary"]}>{skill.summary}</p>
          <div className={styles["detailMeta"]}>
            <span>{skill.status === "pilot" ? "First reviewed pilot" : "Reviewed launch path"}</span>
            <span>{skill.reviewCadence}</span>
          </div>
          <div className={styles["cardLinks"]}>
            <Link className={styles["primaryLink"]} href={`/en/learn/${skill.levelId}`}>
              Start reviewed practice
            </Link>
            <Link className={styles["secondaryLink"]} href={`/en/skills/${skill.slug}`}>
              Read skill overview
            </Link>
          </div>
        </section>

        <div className={styles["contentGrid"]}>
          <section className={styles["outcomeCard"]} aria-labelledby="path-outcomes-title">
            <h2 id="path-outcomes-title">Learning outcomes</h2>
            <ul>
              {skill.outcomes.map((outcome) => (
                <li key={outcome}>{outcome}</li>
              ))}
            </ul>
          </section>

          <section className={styles["contentCard"]} aria-labelledby="path-structure-title">
            <h2 id="path-structure-title">Path structure</h2>
            <ol>
              {skill.modules.map((module) => (
                <li key={module}>{module}</li>
              ))}
            </ol>
          </section>

          <section className={styles["contentCard"]} aria-labelledby="challenge-types-title">
            <h2 id="challenge-types-title">Practice formats</h2>
            <ul>
              {skill.challengeTypes.map((challengeType) => (
                <li key={challengeType}>{challengeType}</li>
              ))}
            </ul>
          </section>

          <section className={styles["contentCard"]} aria-labelledby="publication-title">
            <h2 id="publication-title">Publication standard</h2>
            <p>
              SkillUp publishes a path only after its learning objectives, answer logic,
              explanations, accessibility and safety have been reviewed. Learner attempts remain
              tied to the exact version presented.
            </p>
            {skill.editorialNote ? <p>{skill.editorialNote}</p> : null}
          </section>
        </div>

        <JsonLd value={structuredPath} />
        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
              { "@type": "ListItem", position: 2, name: "Skills", item: skillsUrl },
              { "@type": "ListItem", position: 3, name: skill.title, item: skillUrl },
              { "@type": "ListItem", position: 4, name: "Learning path", item: pathUrl },
            ],
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
