import { BrandMark } from "@skillup/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { safeReturnTo } from "../../../lib/return-to";
import styles from "../account-flow.module.css";
import { SignInForm } from "../sign-in/sign-in-form";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}>;

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your SkillUp account with your mobile number and password.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function SignUpPage({ params, searchParams }: PageProps) {
  const [{ locale }, { returnTo }] = await Promise.all([params, searchParams]);
  if (locale !== "en") notFound();
  const destination = safeReturnTo(returnTo);

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
        <section className={styles["intro"]} aria-labelledby="sign-up-title">
          <p className={styles["eyebrow"]}>Your learning profile</p>
          <h1 className={styles["title"]} id="sign-up-title">
            Create your SkillUp account.
          </h1>
          <p className={styles["summary"]}>
            Sign up with your name, JazzCash mobile number and password to save progress and start
            learning.
          </p>
          <ul className={styles["commitments"]} aria-label="Account commitments">
            <li>Name, mobile number and password</li>
            <li>JazzCash number prefills after Premium checkout</li>
            <li>Private progress is never indexed</li>
          </ul>
        </section>

        <SignInForm returnTo={destination} intent="sign-up" />
      </div>
    </main>
  );
}
