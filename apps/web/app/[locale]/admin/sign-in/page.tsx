import { BrandMark } from "@skillup/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { safeReturnTo } from "../../../../lib/return-to";
import styles from "../../account-flow.module.css";
import { SignInForm } from "../../sign-in/sign-in-form";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}>;

export const metadata: Metadata = {
  title: "Admin sign in",
  description: "Sign in to the private SkillUp operations and Premium administration console.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminSignInPage({ params, searchParams }: PageProps) {
  const [{ locale }, { returnTo }] = await Promise.all([params, searchParams]);
  if (locale !== "en") notFound();
  const destination = safeReturnTo(returnTo, "/en/admin/premium?tab=campaign");

  return (
    <main className={styles["shell"]}>
      <header className={styles["header"]}>
        <Link className={styles["homeLink"]} href="/en" aria-label="SkillUp home">
          <BrandMark className="brand-mark" />
        </Link>
        <Link className={styles["backLink"]} href="/en/admin">
          Back to admin
        </Link>
      </header>

      <div className={styles["layout"]}>
        <section className={styles["intro"]} aria-labelledby="admin-sign-in-title">
          <p className={styles["eyebrow"]}>Private operations</p>
          <h1 className={styles["title"]} id="admin-sign-in-title">
            Sign in to administer SkillUp.
          </h1>
          <p className={styles["summary"]}>
            This console is for named operators only. Capabilities come from server-side roles;
            signing in here does not grant Premium access or publish authority by itself.
          </p>
          <ul className={styles["commitments"]} aria-label="Admin access commitments">
            <li>Passwordless email or mobile verification</li>
            <li>Roles checked again on every admin API request</li>
            <li>After success you land on Campaign attribution, not the learner home</li>
          </ul>
        </section>

        <SignInForm returnTo={destination} mode="admin" />
      </div>
    </main>
  );
}
