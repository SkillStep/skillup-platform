import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

import { type LandingCampaign, normalizeLandingCampaign } from "../../lib/landing-campaign";
import styles from "./landing.module.css";
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
  const canonical = new URL("/landing", publicAppUrl);
  canonical.searchParams.set("utm", campaign.utm);
  canonical.searchParams.set("package", campaign.package);
  canonical.searchParams.set("parameter", campaign.parameter);

  return {
    title: "SkillUp Premium — Learn AI Skills through Games",
    description:
      "Learn AI Skills through games for better earning. Enter your JazzCash number to subscribe to SkillUp Premium.",
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

const courses = [
  {
    icon: "briefcase" as const,
    title: "Freelancing &",
    text: "Remote Work",
    sub: "Online kaam seekho aur earning shuru karo",
    tone: styles["purple"],
  },
  {
    icon: "store" as const,
    title: "Business &",
    text: "Entrepreneurship",
    sub: "Apna business samjho aur grow karo",
    tone: styles["green"],
  },
  {
    icon: "megaphone" as const,
    title: "Marketing,",
    text: "Content & Growth",
    sub: "Apna brand banao aur audience tak pahuche",
    tone: styles["orange"],
  },
  {
    icon: "user" as const,
    title: "Career &",
    text: "Employability",
    sub: "Naukri ke liye skills seekho aur ready ho jao",
    tone: styles["blue"],
  },
];

function LandingContent({
  campaign,
  checkoutMode,
}: Readonly<{
  campaign: LandingCampaign;
  checkoutMode: CheckoutMode;
}>): ReactElement {
  return (
    <main className={styles["page"]}>
      <div className={styles["aboveFold"]}>
        <section className={styles["hero"]} aria-labelledby="premium-hero-heading">
          <h1 id="premium-hero-heading" className={styles["visuallyHidden"]}>
            Learn AI Skills through games for better earning
          </h1>
          <Image
            src="/landing/skillup-premium-banner.jpg"
            alt="SkillUp Premium: Learn AI Skills through games for better earning. Game khelo, Skill seekho, Zyada kamao. Trusted by learners across Pakistan."
            width={780}
            height={312}
            className={styles["bannerImage"]}
            priority
            sizes="(max-width: 900px) 100vw, 900px"
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
            {courses.map((course) => (
              <article className={styles["course"]} key={course.title}>
                <div className={`${styles["courseIcon"]} ${course.tone}`}>
                  <Icon name={course.icon} />
                </div>
                <h3>
                  {course.title}
                  <br />
                  {course.text}
                </h3>
                <p>{course.sub}</p>
              </article>
            ))}
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
  const checkoutMode = await resolveCheckoutMode();
  return <LandingContent campaign={campaign} checkoutMode={checkoutMode} />;
}
