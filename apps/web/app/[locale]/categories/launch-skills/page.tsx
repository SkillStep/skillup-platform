import { canonicalUrl } from "@skillup/discoverability";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { launchCategory, publicSkills } from "../../../../lib/public-catalog";
import { Breadcrumbs, JsonLd, PublicFooter, PublicHeader } from "../../discovery-shell";
import styles from "../../discovery.module.css";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en") return {};
  const url = canonicalUrl(publicAppUrl, "en", `/categories/${launchCategory.slug}`);
  return {
    title: launchCategory.title,
    description: launchCategory.summary,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title: launchCategory.title,
      description: launchCategory.summary,
      url,
      siteName: "SkillUp",
      locale: "en_PK",
    },
    twitter: { card: "summary", title: launchCategory.title, description: launchCategory.summary },
  };
}

export default async function LaunchCategoryPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  const homeUrl = canonicalUrl(publicAppUrl, "en");
  const categoryUrl = canonicalUrl(publicAppUrl, "en", `/categories/${launchCategory.slug}`);

  return (
    <>
      <PublicHeader />
      <main className={styles["page"]}>
        <Breadcrumbs items={[{ label: "Home", href: "/en" }, { label: launchCategory.title }]} />

        <section className={styles["hero"]} aria-labelledby="category-title">
          <p className={styles["eyebrow"]}>Skill category</p>
          <h1 id="category-title">{launchCategory.title}</h1>
          <p className={styles["heroSummary"]}>{launchCategory.summary}</p>
        </section>

        <div className={styles["catalogGrid"]}>
          {publicSkills.map((skill) => (
            <article className={styles["catalogCard"]} key={skill.slug}>
              <span
                className={`${styles["status"]} ${
                  skill.status === "pilot" ? styles["statusPilot"] : styles["statusPlanned"]
                }`}
              >
                {skill.status === "pilot" ? "Reviewed pilot" : "Planned path"}
              </span>
              <h2>{skill.title}</h2>
              <p>{skill.summary}</p>
              <div className={styles["cardLinks"]}>
                <Link className={styles["primaryLink"]} href={`/en/skills/${skill.slug}`}>
                  Explore skill
                </Link>
                <Link className={styles["secondaryLink"]} href={`/en/paths/${skill.slug}`}>
                  View path
                </Link>
              </div>
            </article>
          ))}
        </div>

        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: launchCategory.title,
            description: launchCategory.summary,
            url: categoryUrl,
            inLanguage: "en-PK",
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: publicSkills.length,
              itemListElement: publicSkills.map((skill, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: skill.title,
                url: canonicalUrl(publicAppUrl, "en", `/skills/${skill.slug}`),
              })),
            },
          }}
        />
        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
              {
                "@type": "ListItem",
                position: 2,
                name: launchCategory.title,
                item: categoryUrl,
              },
            ],
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
