import { canonicalUrl } from "@skillup/discoverability";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  type PublicPolicySection,
  publicPolicies,
  publicPolicy,
} from "../../../../lib/public-policies";
import styles from "../../discovery.module.css";
import { Breadcrumbs, JsonLd, PublicFooter, PublicHeader } from "../../discovery-shell";

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

function sectionAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function PolicySection({ section }: Readonly<{ section: PublicPolicySection }>) {
  const anchor = sectionAnchor(section.heading);
  return (
    <section className={styles["contentCard"]} id={anchor} aria-labelledby={`${anchor}-title`}>
      <h2 id={`${anchor}-title`}>{section.heading}</h2>
      {section.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.list && section.list.length > 0 ? (
        <ul>
          {section.list.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {section.table ? (
        <div className={styles["policyTableWrap"]}>
          <table className={styles["policyTable"]}>
            <thead>
              <tr>
                {section.table.headers.map((header) => (
                  <th key={header} scope="col">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row) => (
                <tr key={row.join("|")}>
                  {row.map((cell) => (
                    <td key={`${row[0]}-${cell}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export default async function PolicyPage({ params }: PageProps) {
  const { locale, policy: slug } = await params;
  if (locale !== "en") notFound();
  const policy = publicPolicy(slug);
  if (!policy) notFound();

  const homeUrl = canonicalUrl(publicAppUrl, "en");
  const policyUrl = canonicalUrl(publicAppUrl, "en", `/legal/${policy.slug}`);
  const documentLayout = policy.layout === "document";

  return (
    <>
      <PublicHeader />
      <main className={styles["page"]}>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/en" },
            { label: "Legal", href: "/en/legal/terms" },
            { label: policy.title },
          ]}
        />
        <section
          className={`${styles["detailHero"]} ${documentLayout ? styles["policyDocumentHero"] : ""}`}
          aria-labelledby="policy-title"
        >
          <p className={styles["eyebrow"]}>
            {documentLayout
              ? `Last modified ${policy.version} · Practical learning through short, focused games`
              : `Version ${policy.version} · current launch policy`}
          </p>
          <h1 id="policy-title">{policy.title}</h1>
          <p className={styles["detailSummary"]}>{policy.summary}</p>
          <div className={styles["cardLinks"]}>
            <Link className={styles["primaryLink"]} href="/en/support">
              Contact support
            </Link>
            <Link className={styles["secondaryLink"]} href="/en/legal/privacy">
              Privacy policy
            </Link>
            <Link className={styles["secondaryLink"]} href="/en/legal/refund">
              Refund policy
            </Link>
          </div>
        </section>

        {documentLayout ? (
          <nav className={styles["policyToc"]} aria-label="Terms sections">
            <h2>On this page</h2>
            <ol>
              {policy.sections.map((section) => (
                <li key={section.heading}>
                  <a href={`#${sectionAnchor(section.heading)}`}>{section.heading}</a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className={documentLayout ? styles["policyDocument"] : styles["contentGrid"]}>
          {policy.sections.map((section) => (
            <PolicySection key={section.heading} section={section} />
          ))}
        </div>

        <section className={styles["contentCard"]}>
          <h2>Version and updates</h2>
          <p>
            This is the current published SkillUp policy version. Material updates are released as a
            new version, and any acknowledgement requirement remains attached to the exact version
            accepted by the learner.
          </p>
        </section>

        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: policy.title,
            description: policy.summary,
            url: policyUrl,
            dateModified: policy.version,
            inLanguage: "en-PK",
            isPartOf: { "@type": "WebSite", name: "SkillUp", url: homeUrl },
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
