export type PublicContentKind = "guide" | "question" | "glossary" | "comparison";

export type PublicContentEntry = Readonly<{
  id: string;
  kind: PublicContentKind;
  slug: string;
  locale: "en" | "ur";
  title: string;
  summary: string;
  directAnswer: string | null;
  body: Readonly<Record<string, unknown>>;
  sourceReferences: readonly Readonly<Record<string, unknown>>[];
  authorName: string;
  reviewerName: string;
  version: number;
  publishedAt: string;
  reviewedAt: string;
  freshnessReviewAt: string | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Public content response has an invalid ${field}.`);
  }
  return value;
}

function parseEntry(value: unknown): PublicContentEntry {
  if (!isRecord(value)) throw new Error("Public content response is not an object.");
  const kind = requireString(value["kind"], "kind");
  if (!(["guide", "question", "glossary", "comparison"] as const).includes(kind as PublicContentKind)) {
    throw new Error("Public content response has an unsupported kind.");
  }
  const locale = requireString(value["locale"], "locale");
  if (locale !== "en" && locale !== "ur") {
    throw new Error("Public content response has an unsupported locale.");
  }
  if (!isRecord(value["body"]) || !Array.isArray(value["sourceReferences"])) {
    throw new Error("Public content response has invalid body or source evidence.");
  }

  return {
    id: requireString(value["id"], "id"),
    kind: kind as PublicContentKind,
    slug: requireString(value["slug"], "slug"),
    locale,
    title: requireString(value["title"], "title"),
    summary: requireString(value["summary"], "summary"),
    directAnswer:
      value["directAnswer"] === null ? null : requireString(value["directAnswer"], "direct answer"),
    body: value["body"],
    sourceReferences: value["sourceReferences"].filter(isRecord),
    authorName: requireString(value["authorName"], "author"),
    reviewerName: requireString(value["reviewerName"], "reviewer"),
    version: Number(value["version"]),
    publishedAt: requireString(value["publishedAt"], "publication date"),
    reviewedAt: requireString(value["reviewedAt"], "review date"),
    freshnessReviewAt:
      value["freshnessReviewAt"] === null
        ? null
        : requireString(value["freshnessReviewAt"], "freshness date"),
  };
}

export async function fetchPublicContent(
  kind: PublicContentKind,
  slug: string,
): Promise<PublicContentEntry | null> {
  const apiBaseUrl = process.env["API_BASE_URL"] ?? "http://localhost:3001";
  const url = new URL(
    `/v1/public/content/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`,
    apiBaseUrl,
  );
  url.searchParams.set("locale", "en");

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Public content API returned ${response.status}.`);
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error("Public content API returned an invalid envelope.");
  return parseEntry(body["entry"]);
}

export const publicContentRoutes = [
  { kind: "guide", segment: "guides", slug: "prepare-evidence-based-interview-answer" },
  { kind: "question", segment: "questions", slug: "how-do-i-answer-tell-me-about-yourself" },
  { kind: "glossary", segment: "glossary", slug: "evidence-based-answer" },
  { kind: "comparison", segment: "comparisons", slug: "vague-vs-evidence-based-interview-answer" },
] as const satisfies readonly Readonly<{
  kind: PublicContentKind;
  segment: string;
  slug: string;
}>[];

export function publicContentPath(kind: PublicContentKind, slug: string): string {
  const segment =
    publicContentRoutes.find((route) => route.kind === kind)?.segment ?? `${kind}s`;
  return `/en/${segment}/${slug}`;
}
