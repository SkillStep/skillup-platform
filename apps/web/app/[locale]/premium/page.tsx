import type { Metadata } from "next";
import { notFound } from "next/navigation";
import accountStyles from "../account/account.module.css";
import { PublicFooter, PublicHeader } from "../discovery-shell";
import { PremiumFeatures } from "./premium-features";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Premium Features",
  description: "Open your unlocked SkillUp Premium features after JazzCash subscription.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function PremiumFeaturesPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <>
      <PublicHeader />
      <main className={accountStyles["main"]}>
        <header className={accountStyles["header"]}>
          <p className="eyebrow">Premium</p>
          <h1>Premium Features</h1>
          <p>
            After a successful JazzCash subscription, sign in with your JazzCash mobile number to
            use Premium Features. This page is never indexed.
          </p>
        </header>
        <PremiumFeatures />
      </main>
      <PublicFooter />
    </>
  );
}
