import { canonicalUrl } from "@skillup/discoverability";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs, JsonLd, PublicFooter, PublicHeader } from "../discovery-shell";
import styles from "../discovery.module.css";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SkillUp support",
  description:
    "Find safe recovery, learning, payment, privacy and accessibility support guidance for SkillUp.",
};

export default async function SupportPage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  const url = canonicalUrl(publicAppUrl, "en", "/support");

  return (
    <>
      <PublicHeader />
      <main className={styles["page"]}>
        <Breadcrumbs items={[{ label: "Home", href: "/en" }, { label: "Support" }]} />
        <section className={styles["detailHero"]} aria-labelledby="support-title">
          <p className={styles["eyebrow"]}>Learner support</p>
          <h1 id="support-title">Resolve access, learning, payment or privacy issues safely.</h1>
          <p className={styles["detailSummary"]}>
            Support never needs your verification code, session cookie, JazzCash password, API key
            or full payment credential. Keep those details private.
          </p>
          <div className={styles["cardLinks"]}>
            <Link className={styles["primaryLink"]} href="/en/account">
              Open private account controls
            </Link>
            <Link className={styles["secondaryLink"]} href="/en/sign-in">
              Recover access with email verification
            </Link>
          </div>
        </section>

        <div className={styles["contentGrid"]}>
          <section className={styles["contentCard"]}>
            <h2>Sign-in and account recovery</h2>
            <p>
              Request a new email verification code from the sign-in page. Expired, reused and
              rate-limited codes fail safely. Once signed in, inspect devices and revoke sessions
              you do not recognize.
            </p>
          </section>
          <section className={styles["contentCard"]}>
            <h2>Learning and progress</h2>
            <p>
              Keep the level, challenge and approximate time of the issue. Do not include protected
              answers or another learner&apos;s information. Server-authoritative progress and
              reward records are used for investigation.
            </p>
          </section>
          <section className={styles["contentCard"]}>
            <h2>JazzCash and premium</h2>
            <p>
              Keep the SkillUp merchant reference and provider reference shown in your private
              payment history. Never share your JazzCash PIN or one-time code. Pending, failed,
              duplicated and refunded payments are reviewed against both systems.
            </p>
          </section>
          <section className={styles["contentCard"]}>
            <h2>Privacy and deletion</h2>
            <p>
              Use the account page to change optional consent, download an export or schedule
              deletion. Deletion has a seven-day cancellation window and preserves only required
              payment, fraud-prevention and privileged audit evidence.
            </p>
          </section>
          <section className={styles["contentCard"]}>
            <h2>Accessibility</h2>
            <p>
              Report the device, browser, assistive technology, zoom level and exact blocked action.
              SkillUp targets keyboard access, screen-reader clarity, reduced motion, touch-sized
              controls and readable mobile layouts.
            </p>
          </section>
          <section className={styles["contentCard"]}>
            <h2>AI content concerns</h2>
            <p>
              Report inaccurate, unsafe or unclear material using its public page or learning-level
              reference. AI output cannot publish itself; reviewed corrections preserve the earlier
              version used by existing learner attempts.
            </p>
          </section>
        </div>

        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "ContactPage",
            name: "SkillUp support",
            description:
              "Safe recovery, learning, payment, privacy and accessibility support guidance.",
            url,
            inLanguage: "en-PK",
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
