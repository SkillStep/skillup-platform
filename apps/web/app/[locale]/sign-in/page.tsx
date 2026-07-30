import { BrandMark } from "@skillup/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import styles from "../account-flow.module.css";
import { SignInForm } from "./sign-in-form";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const metadata: Metadata = {
  title: "Sign in",
  description: "Securely sign in to SkillUp with a short-lived email verification code.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function SignInPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  return (
    <main className={styles["shell"]}>
      <header className={styles["header"]}>
        <Link className={styles["homeLink"]} href="/en" aria-label="SkillUp home">
          <BrandMark className="brand-mark" />
        </Link>
        <Link className={styles["backLink"]} href="/en">
          Back to home
        </Link>
      </header>

      <div className={styles["layout"]}>
        <section className={styles["intro"]} aria-labelledby="sign-in-title">
          <p className={styles["eyebrow"]}>Your learning profile</p>
          <h1 className={styles["title"]} id="sign-in-title">
            Pick up where you left off.
          </h1>
          <p className={styles["summary"]}>
            Sign in securely to save progress, continue your learning path and build a useful daily
            practice habit.
          </p>
          <ul className={styles["commitments"]} aria-label="Account commitments">
            <li>No password stored</li>
            <li>Short-lived, single-use verification code</li>
            <li>Private progress is never indexed</li>
          </ul>
        </section>

        <SignInForm />
      </div>
    </main>
  );
}
