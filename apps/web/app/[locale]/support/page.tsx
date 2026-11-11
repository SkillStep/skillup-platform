import { canonicalUrl } from "@skillup/discoverability";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../discovery.module.css";
import { Breadcrumbs, JsonLd, PublicFooter, PublicHeader } from "../discovery-shell";
import { MotionReveal } from "../motion-reveal";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";
const supportEmail = process.env["PUBLIC_SUPPORT_EMAIL"] ?? "admin@codistan.org";

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
        <MotionReveal variant="fade-right" durationMs={750}>
          <section className={styles["detailHero"]} aria-labelledby="support-title">
            <p className={styles["eyebrow"]}>Learner support</p>
            <h1 id="support-title">Resolve access, learning, payment or privacy issues safely.</h1>
            <p className={styles["detailSummary"]}>
              Support never needs your verification code, session cookie, JazzCash password, API key
              or full payment credential. Keep those details private.
            </p>
            <div className={styles["cardLinks"]}>
              <a className={styles["primaryLink"]} href={`mailto:${supportEmail}`}>
                Email SkillUp support
              </a>
              <Link className={styles["secondaryLink"]} href="/en/account">
                Open private account controls
              </Link>
            </div>
            <p className={styles["detailSummary"]}>
              Launch support email: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. For
              payment or refund review, include the SkillUp merchant reference and provider
              reference shown in your private payment history.
            </p>
          </section>
        </MotionReveal>

        <div className={styles["contentGrid"]}>
          {[
            {
              title: "Sign-in and account recovery",
              body: "Request a new email verification code from the sign-in page. Expired, reused and rate-limited codes fail safely. Once signed in, inspect devices and revoke sessions you do not recognize.",
            },
            {
              title: "Learning and progress",
              body: "Keep the level, challenge and approximate time of the issue. Do not include protected answers or another learner's information. Server-authoritative progress and reward records are used for investigation.",
            },
            {
              title: "JazzCash and premium",
              body: `Keep the SkillUp merchant reference and provider reference shown in your private payment history. Email ${supportEmail} for payment or refund review. Never share your JazzCash PIN or one-time code. Pending, failed, duplicated and refunded payments are reviewed against both systems.`,
            },
            {
              title: "Privacy and deletion",
              body: "Use the account page to change optional consent, download an export or schedule deletion. Deletion has a seven-day cancellation window and preserves only required payment, fraud-prevention and privileged audit evidence.",
            },
            {
              title: "Accessibility",
              body: "Report the device, browser, assistive technology, zoom level and exact blocked action. SkillUp targets keyboard access, screen-reader clarity, reduced motion, touch-sized controls and readable mobile layouts.",
            },
            {
              title: "AI content concerns",
              body: "Report inaccurate, unsafe or unclear material using its public page or learning-level reference. AI output cannot publish itself; reviewed corrections preserve the earlier version used by existing learner attempts.",
            },
          ].map((card, index) => (
            <MotionReveal
              key={card.title}
              variant="fade-up"
              delayMs={Math.min(index, 5) * 70}
              durationMs={600}
            >
              <section className={styles["contentCard"]}>
                <h2>{card.title}</h2>
                <p>{card.body}</p>
              </section>
            </MotionReveal>
          ))}
        </div>

        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "ContactPage",
            name: "SkillUp support",
            description:
              "Safe recovery, learning, payment, privacy and accessibility support guidance.",
            url,
            email: supportEmail,
            inLanguage: "en-PK",
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
