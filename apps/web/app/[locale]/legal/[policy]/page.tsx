import { canonicalUrl } from "@skillup/discoverability";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { publicPolicies, publicPolicy } from "../../../../lib/public-policies";
import { Breadcrumbs, JsonLd, PublicFooter, PublicHeader } from "../../discovery-shell";
import styles from "../../discovery.module.css";

type PageProps = Readonly<{
  params: Promise<{ locale: string; policy: string }>;
}>;

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return publicPolicies.map((policy) => ({ locale: "en", policy: policy.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, policy: slug } = await params;
  if (locale !== "en") return {};
  const policy = publicPolicy(slug);
  if (!policy) return {};
  const url = canonicalUrl(publicAppUrl, "en", `/legal/${policy.slug}`);
  return {
    title: policy.title,
    description: policy.summary,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: policy.title,
      description: policy.summary,
      url,
      siteName: "SkillUp",
      locale: "en_PK",
    },
    twitter: { card: "summary", title: policy.title, description: policy.summary },
  };
}

export default async function PolicyPage({ params }: PageProps) {
  const { locale, policy: slug } = await params;
  if (locale !== "en") notFound();
  const policy = publicPolicy(slug);
  if (!policy) notFound();

  const homeUrl = canonicalUrl(publicAppUrl, "en");
  const policyUrl = canonicalUrl(publicAppUrl, "en", `/legal/${policy.slug}`);

  return (
    <>
      <PublicHeader />
      <main className={styles["page"]}>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/en" },
            { label: "Policies", href: "/en/account" },
            { label: policy.title },
          ]}
        />
        <section className={styles["detailHero"]} aria-labelledby="policy-title">
          <p className={styles["eyebrow"]}>Version {policy.version} · provisional launch copy</p>
          <h1 id="policy-title">{policy.title}</h1>
          <p className={styles["detailSummary"]}>{policy.summary}</p>
          <div className={styles["cardLinks"]}>
            <Link className={styles["primaryLink"]} href="/en/account">
              Manage account controls
            </Link>
            <Link className={styles["secondaryLink"]} href="/en/support">
              Contact support
            </Link>
          </div>
        </section>

        <div className={styles["contentGrid"]}>
          {policy.sections.map((section) => (
            <section className={styles["contentCard"]} key={section.heading}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <section className={styles["contentCard"]}>
          <h2>Version and approval status</h2>
          <p>
            This is versioned provisional launch copy dated August 1, 2026. Final legally approved
            wording can be published as a new policy version. Existing acknowledgements remain
            attached to the exact version accepted.
          </p>
        </section>

        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: policy.title,
            description: policy.summary,
            url: policyUrl,
            dateModified: "2026-08-01",
            inLanguage: "en-PK",
            isPartOf: { "@type": "WebSite", name: "SkillUp", url: homeUrl },
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
