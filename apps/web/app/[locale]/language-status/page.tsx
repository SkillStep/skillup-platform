import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  isRouteLocale,
  localeDefinitions,
  localeDirection,
  type RouteLocale,
} from "../../../lib/locales";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const metadata: Metadata = {
  title: "Language availability",
  description: "Review the current SkillUp language rollout status.",
  robots: { index: false, follow: true },
};

const copy: Readonly<
  Record<RouteLocale, Readonly<{ eyebrow: string; title: string; body: string; action: string }>>
> = {
  en: {
    eyebrow: "Language availability",
    title: "English is available for launch.",
    body: "Urdu routes, right-to-left direction and fallback rules are reserved and tested. Urdu learning content will only be enabled after editorial and usability review.",
    action: "Continue in English",
  },
  ur: {
    eyebrow: "زبان کی دستیابی",
    title: "اردو ورژن تیاری کے مرحلے میں ہے۔",
    body: "اردو کے راستے، دائیں سے بائیں ترتیب اور انگریزی متبادل محفوظ اور آزمودہ ہیں۔ مکمل اردو مواد اداریاتی اور استعمال کی جانچ کے بعد فعال ہوگا۔",
    action: "انگریزی میں جاری رکھیں",
  },
};

export default async function LanguageStatusPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isRouteLocale(locale)) notFound();

  const content = copy[locale];
  const definition = localeDefinitions[locale];

  return (
    <main
      lang={locale}
      dir={localeDirection(locale)}
      style={{
        display: "grid",
        minHeight: "100svh",
        placeItems: "center",
        padding: "1.5rem",
        textAlign: locale === "ur" ? "right" : "left",
      }}
    >
      <section style={{ maxWidth: "720px" }}>
        <p>{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.body}</p>
        <p>
          {definition.enabled
            ? `${definition.nativeLabel} is enabled.`
            : `${definition.nativeLabel} is reserved but not enabled.`}
        </p>
        <Link href="/en">{content.action}</Link>
      </section>
    </main>
  );
}
