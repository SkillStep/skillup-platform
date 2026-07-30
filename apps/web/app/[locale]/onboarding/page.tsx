import { BrandMark } from "@skillup/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import styles from "../account-flow.module.css";
import { OnboardingForm } from "./onboarding-form";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const metadata: Metadata = {
  title: "Set up your learning profile",
  description: "Choose your first SkillUp learning goal and private profile preferences.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function OnboardingPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <main className={styles["shell"]}>
      <header className={styles["header"]}>
        <Link className={styles["homeLink"]} href="/en" aria-label="SkillUp home">
          <BrandMark className="brand-mark" />
        </Link>
        <Link className={styles["backLink"]} href="/en">
          Save and return later
        </Link>
      </header>

      <div className={styles["layout"]}>
        <section className={styles["intro"]} aria-labelledby="onboarding-title">
          <p className={styles["eyebrow"]}>A focused start</p>
          <h1 className={styles["title"]} id="onboarding-title">
            Tell us what progress means to you.
          </h1>
          <p className={styles["summary"]}>
            SkillUp uses your goal to recommend a practical starting path. You can change these
            details later from your private profile.
          </p>
          <ul className={styles["commitments"]} aria-label="Onboarding commitments">
            <li>Only a few useful questions</li>
            <li>No public learner profile by default</li>
            <li>Preferences can be changed later</li>
          </ul>
        </section>

        <OnboardingForm />
      </div>
    </main>
  );
}
