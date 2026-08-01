import { canonicalUrl } from "@skillup/discoverability";
import Link from "next/link";

import { type PublicContentEntry, publicContentPath } from "../../lib/public-content";
import { Breadcrumbs, JsonLd, PublicFooter, PublicHeader } from "./discovery-shell";
import styles from "./discovery.module.css";
import { PublicContentReport } from "./public-content-report";

function records(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function label(kind: PublicContentEntry["kind"]): string {
  if (kind === "guide") return "Guide";
  if (kind === "question") return "Question";
  if (kind === "glossary") return "Glossary";
  return "Comparison";
}

function dateLabel(value: string | null): string {
  if (!value) return "No review date set";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "long",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

function RelatedLinks({ body }: Readonly<{ body: PublicContentEntry["body"] }>) {
  const related = records(body["related"]);
  if (related.length === 0) return null;
  return (
    <section className={styles["contentCard"]}>
      <h2>Related learning</h2>
      <ul>
        {related.map((item) => {
          const kind = item["kind"];
          const slug = item["slug"];
          if (
            typeof kind !== "string" ||
            typeof slug !== "string" ||
            !["guide", "question", "glossary", "comparison"].includes(kind)
          ) {
            return null;
          }
          return (
            <li key={`${kind}:${slug}`}>
              <Link href={publicContentPath(kind as PublicContentEntry["kind"], slug)}>
                {slug.replaceAll("-", " ")}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PublicContentPage({ entry }: Readonly<{ entry: PublicContentEntry }>) {
  const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";
  const path = publicContentPath(entry.kind, entry.slug).replace(/^\/en/, "");
  const pageUrl = canonicalUrl(publicAppUrl, "en", path);
  const sections = records(entry.body["sections"]);
  const examples = records(entry.body["examples"]);
  const comparison = records(entry.body["comparison"]);
  const introduction =
    typeof entry.body["introduction"] === "string" ? entry.body["introduction"] : null;
  const singleExample = typeof entry.body["example"] === "string" ? entry.body["example"] : null;

  return (
    <>
      <PublicHeader />
      <main className={styles["page"]}>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/en" },
            { label: label(entry.kind) },
            { label: entry.title },
          ]}
        />

        <section className={styles["detailHero"]} aria-labelledby="content-title">
          <p className={styles["eyebrow"]}>
            {label(entry.kind)} · reviewed version {entry.version}
          </p>
          <h1 id="content-title">{entry.title}</h1>
          <p className={styles["detailSummary"]}>{entry.summary}</p>
          <div className={styles["detailMeta"]}>
            <span>By {entry.authorName}</span>
            <span>Reviewed by {entry.reviewerName}</span>
            <span>Reviewed {dateLabel(entry.reviewedAt)}</span>
          </div>
        </section>

        {entry.directAnswer ? (
          <section className={styles["outcomeCard"]} aria-labelledby="direct-answer-title">
            <h2 id="direct-answer-title">Direct answer</h2>
            <p>{entry.directAnswer}</p>
          </section>
        ) : null}

        {introduction ? (
          <section className={styles["contentCard"]}>
            <p>{introduction}</p>
          </section>
        ) : null}

        <div className={styles["contentGrid"]}>
          {sections.map((section) => {
            const heading =
              typeof section["heading"] === "string" ? section["heading"] : "Reviewed guidance";
            return (
              <section className={styles["contentCard"]} key={heading}>
                <h2>{heading}</h2>
                {strings(section["paragraphs"]).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            );
          })}

          {examples.map((example) => {
            const exampleLabel =
              typeof example["label"] === "string" ? example["label"] : "Example";
            const text = typeof example["text"] === "string" ? example["text"] : "";
            return (
              <section className={styles["contentCard"]} key={`${exampleLabel}:${text}`}>
                <h2>{exampleLabel}</h2>
                <p>{text}</p>
              </section>
            );
          })}

          {singleExample ? (
            <section className={styles["contentCard"]}>
              <h2>Example answer</h2>
              <p>{singleExample}</p>
            </section>
          ) : null}

          {comparison.map((row) => {
            const dimension =
              typeof row["dimension"] === "string" ? row["dimension"] : "Comparison";
            return (
              <section className={styles["contentCard"]} key={dimension}>
                <h2>{dimension}</h2>
                <p>
                  <strong>Vague:</strong> {typeof row["vague"] === "string" ? row["vague"] : ""}
                </p>
                <p>
                  <strong>Evidence-based:</strong>{" "}
                  {typeof row["evidenceBased"] === "string" ? row["evidenceBased"] : ""}
                </p>
              </section>
            );
          })}

          <RelatedLinks body={entry.body} />
        </div>

        <section className={styles["contentCard"]} aria-labelledby="evidence-title">
          <h2 id="evidence-title">Source and freshness evidence</h2>
          <p>
            Published {dateLabel(entry.publishedAt)}. Next freshness review:{" "}
            {dateLabel(entry.freshnessReviewAt)}.
          </p>
          <ul>
            {entry.sourceReferences.map((source) => (
              <li
                key={`${String(source["title"] ?? "Source")}:${String(source["publisher"] ?? "Unknown publisher")}:${String(source["locator"] ?? "No locator")}`}
              >
                <strong>{String(source["title"] ?? "Reviewed source")}</strong>
                {source["publisher"] ? ` — ${String(source["publisher"])}` : ""}
                {source["locator"] ? `, ${String(source["locator"])}` : ""}
              </li>
            ))}
          </ul>
        </section>

        <PublicContentReport targetId={entry.id} />

        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": entry.kind === "question" ? "FAQPage" : "LearningResource",
            name: entry.title,
            description: entry.summary,
            url: pageUrl,
            inLanguage: "en-PK",
            datePublished: entry.publishedAt,
            dateModified: entry.reviewedAt,
            author: { "@type": "Organization", name: entry.authorName },
            reviewedBy: { "@type": "Organization", name: entry.reviewerName },
            ...(entry.kind === "question" && entry.directAnswer
              ? {
                  mainEntity: {
                    "@type": "Question",
                    name: entry.title,
                    acceptedAnswer: { "@type": "Answer", text: entry.directAnswer },
                  },
                }
              : {}),
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
