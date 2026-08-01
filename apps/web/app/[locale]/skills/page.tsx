import { canonicalUrl } from "@skillup/discoverability";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { publicSkills } from "../../../lib/public-catalog";
import { Breadcrumbs, JsonLd, PublicFooter, PublicHeader } from "../discovery-shell";
import styles from "../discovery.module.css";
import { SkillSearch } from "./skill-search";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en") return {};
  const url = canonicalUrl(publicAppUrl, "en", "/skills");
  const title = "Practical skill paths";
  const description =
    "Browse SkillUp's reviewed launch catalog for interview, English, AI, freelancing and digital marketing practice.";

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", title, description, url, siteName: "SkillUp", locale: "en_PK" },
    twitter: { card: "summary", title, description },
  };
}

export default async function SkillsPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  const pageUrl = canonicalUrl(publicAppUrl, "en", "/skills");
  const homeUrl = canonicalUrl(publicAppUrl, "en");

  return (
    <>
      <PublicHeader />
      <main className={styles["page"]}>
        <Breadcrumbs items={[{ label: "Home", href: "/en" }, { label: "Skills" }]} />
        <section className={styles["hero"]} aria-labelledby="skills-title">
          <p className={styles["eyebrow"]}>Reviewed launch catalog</p>
          <h1 id="skills-title">Choose one practical skill to improve.</h1>
          <p className={styles["heroSummary"]}>
            Every listed path now includes reviewed modules, playable levels, varied challenges and
            version-pinned learner progress. Start with the skill that best matches your current
            study or work goal.
          </p>
        </section>

        <SkillSearch skills={publicSkills} />

        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "SkillUp practical skill paths",
            url: pageUrl,
            numberOfItems: publicSkills.length,
            itemListElement: publicSkills.map((skill, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: skill.title,
              url: canonicalUrl(publicAppUrl, "en", `/skills/${skill.slug}`),
            })),
          }}
        />
        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
              { "@type": "ListItem", position: 2, name: "Skills", item: pageUrl },
            ],
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
