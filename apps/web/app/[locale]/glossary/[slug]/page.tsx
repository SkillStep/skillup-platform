import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { fetchPublicContent, publicContentRoutes } from "../../../../lib/public-content";
import { PublicContentPage } from "../../public-content-page";

type PageProps = Readonly<{ params: Promise<{ locale: string; slug: string }> }>;

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return publicContentRoutes
    .filter((route) => route.kind === "glossary")
    .map((route) => ({ locale: "en", slug: route.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (locale !== "en") return {};
  const entry = await fetchPublicContent("glossary", slug).catch(() => null);
  return entry ? { title: entry.title, description: entry.summary } : {};
}

export default async function GlossaryPage({ params }: PageProps) {
  const { locale, slug } = await params;
  if (locale !== "en") notFound();
  const entry = await fetchPublicContent("glossary", slug).catch(() => null);
  if (!entry) notFound();
  return <PublicContentPage entry={entry} />;
}
