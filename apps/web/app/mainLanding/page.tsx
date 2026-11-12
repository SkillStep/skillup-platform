import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";

import { type LandingCampaign, normalizeLandingCampaign } from "../../lib/landing-campaign";
import { loadPublishedPublicSkills } from "../../lib/live-catalog";
import type { PublicSkill } from "../../lib/public-catalog";
import styles from "./landing.module.css";
import { LandingAnalyticsBoot } from "./landing-analytics-boot";
import { LandingBanner } from "./landing-banner";
import { LandingBrowserEscape } from "./landing-browser-escape";
import { Icon } from "./landing-icons";
import { LandingSubscribeCard } from "./landing-subscribe";
import { ScrollReveal } from "./scroll-reveal";

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

type CheckoutMode = "jazzcash_wallet_link" | "jazzcash_v11" | "premium_bypass" | null;

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";
const apiBaseUrl = process.env["API_BASE_URL"] ?? "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const campaign = normalizeLandingCampaign(await searchParams);
  const canonical = new URL("/mainLanding", publicAppUrl);
  canonical.searchParams.set("utm", campaign.utm);
  canonical.searchParams.set("package", campaign.package);
  canonical.searchParams.set("parameter", campaign.parameter);
  canonical.searchParams.set("payment", campaign.payment);

  return {
    title: "SkillUp Premium — Learn AI Skills through Games",
    description:
      "Learn AI Skills through games for better earning. Enter your JazzCash number to subscribe to SkillUp Premium.",
    // Keep the site manifest linked so an already-installed desktop PWA can
    // refresh to scope=/en (landings out of scope). Still mark as non-apple-web-app.
    appleWebApp: {
      capable: false,
    },
    alternates: {
      canonical: canonical.toString(),
    },
    openGraph: {
      title: "SkillUp Premium — Learn AI Skills through Games",
      description: "Learn AI Skills through games for better earning. Subscribe with JazzCash.",
      url: canonical.toString(),
      type: "website",
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

async function resolveCheckoutMode(): Promise<CheckoutMode> {
  try {
    const response = await fetch(new URL("/v1/commercial/plans", apiBaseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return "jazzcash_v11";
    const body = (await response.json()) as Readonly<{
      plans?: readonly Readonly<{ checkoutMode?: CheckoutMode }>[];
    }>;
    const mode = body.plans?.find((plan) => plan.checkoutMode)?.checkoutMode;
    return mode ?? "jazzcash_v11";
  } catch {
    return "jazzcash_v11";
  }
}

const courseIcons = ["briefcase", "store", "megaphone", "user"] as const;
const courseTones = [styles["purple"], styles["green"], styles["orange"], styles["blue"]] as const;

function LandingContent({
  campaign,
  checkoutMode,
  courses,
}: Readonly<{
  campaign: LandingCampaign;
  checkoutMode: CheckoutMode;
  courses: readonly PublicSkill[];
}>): ReactElement {
  return (
    <main className={styles["page"]}>
      <LandingBrowserEscape />
      <LandingAnalyticsBoot campaign={campaign} landing="mainLanding" />
      <div className={styles["aboveFold"]}>
        <section className={styles["hero"]} aria-labelledby="premium-hero-heading">
          <h1 id="premium-hero-heading" className={styles["visuallyHidden"]}>
            Learn AI Skills through games for better earning
          </h1>
          <LandingBanner
            desktopSrc="/landing/skillup-premium-banner-v2.jpg"
            mobileSrc="/landing/skillup-premium-banner-mobile-v3.jpg"
            alt="SkillUp Premium: Learn AI Skills through games for better earning. Game khelo, Skill seekho, Zyada kamao. Trusted by learners across Pakistan."
            desktopWidth={1600}
            desktopHeight={639}
            mobileWidth={864}
            mobileHeight={1152}
          />
        </section>

        <LandingSubscribeCard campaign={campaign} checkoutMode={checkoutMode} />
      </div>

      <ScrollReveal>
        <section className={styles["learning"]} aria-labelledby="learn-heading">
          <div className={styles["sectionHeading"]}>
            <span />
            <h2 id="learn-heading">What You Can Learn</h2>
            <span />
          </div>
          <div className={styles["courseGrid"]}>
            {courses.slice(0, 8).map((course, index) => (
              <article className={styles["course"]} key={course.slug}>
                <div
                  className={`${styles["courseIcon"]} ${courseTones[index % courseTones.length]}`}
                >
                  <Icon name={courseIcons[index % courseIcons.length] ?? "briefcase"} />
                </div>
                <h3>{course.title}</h3>
                <p>{course.levelCount ?? 0} published practice levels</p>
                <Link href={`/en/skills/${course.slug}`}>Explore this course</Link>
              </article>
            ))}
            {courses.length === 0 ? (
              <p role="status">The published course catalogue is temporarily unavailable.</p>
            ) : null}
          </div>
          <div className={`${styles["sectionHeading"]} ${styles["sectionHeadingSmall"]}`}>
            <span />
            <h2>... and much more</h2>
            <span />
          </div>

          <div className={styles["trustRow"]}>
            <div>
              <Icon name="shield" />
              <span>
                <b>Secure Payments</b>
                <small>Powered by JazzCash</small>
              </span>
            </div>
            <div>
              <Icon name="lock" />
              <span>
                <b>Aapka data safe hai</b>
                <small>100% Secure</small>
              </span>
            </div>
            <div>
              <Icon name="headset" />
              <span>
                <b>Help jab chahiye</b>
                <small>24/7 Support</small>
              </span>
            </div>
          </div>

          <p className={styles["privacy"]}>
            Jari rakhne se aap Skillup ki <Link href="/en/legal/terms">Terms and Conditions</Link>{" "}
            aur <Link href="/en/legal/privacy">Privacy Policy</Link> se raazi hoon.
          </p>
        </section>
      </ScrollReveal>
    </main>
  );
}

export default async function LandingPage({ searchParams }: PageProps): Promise<ReactElement> {
  const campaign = normalizeLandingCampaign(await searchParams);
  const [checkoutMode, courses] = await Promise.all([
    resolveCheckoutMode(),
    loadPublishedPublicSkills(),
  ]);
  return <LandingContent campaign={campaign} checkoutMode={checkoutMode} courses={courses} />;
}
