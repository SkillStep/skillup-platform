import Image from "next/image";
import Link from "next/link";
import type { Metadata, ReactElement, ReactNode } from "react";
import styles from "./main-landing2.module.css";
import { ScrollReveal } from "./scroll-reveal";

export const metadata: Metadata = {
  title: "SkillUp Premium — Learn AI Skills through Games",
  description:
    "Learn AI Skills through games for better earning. Enter your JazzCash number to subscribe to SkillUp Premium.",
  alternates: {
    canonical: "/mainLanding2",
  },
  openGraph: {
    title: "SkillUp Premium — Learn AI Skills through Games",
    description: "Learn AI Skills through games for better earning. Subscribe with JazzCash.",
    url: "/mainLanding2",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

type IconName =
  | "briefcase"
  | "store"
  | "megaphone"
  | "user"
  | "shield"
  | "lock"
  | "headset"
  | "phone"
  | "arrow";

function Icon({ name }: { name: IconName }): ReactElement {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  const paths: Record<IconName, ReactNode> = {
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
      </>
    ),
    store: (
      <>
        <path d="M4 10v9h16v-9" />
        <path d="M3 10 5 4h14l2 6" />
        <path d="M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" />
        <path d="M9 19v-4h6v4" />
      </>
    ),
    megaphone: (
      <>
        <path d="m3 11 13-5v12L3 14v-3Z" />
        <path d="M16 9.5h3a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-3M6 15l1.5 5H11l-1.5-4.4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21a7 7 0 0 1 14 0" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v5c0 5-3.3 8.4-8 10-4.7-1.6-8-5-8-10V6l8-3Z" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    headset: (
      <>
        <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
        <path d="M4 14h3v5H5a1 1 0 0 1-1-1v-4ZM20 14h-3v5h2a1 1 0 0 0 1-1v-4Z" />
      </>
    ),
    phone: (
      <>
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.8.3 1.6.6 2.3a2 2 0 0 1-.5 2.1L8.1 9.1a16 16 0 0 0 6 6l1.9-1.1a2 2 0 0 1 2.1-.4c.7.3 1.5.5 2.3.6a2 2 0 0 1 1.6 2.1Z" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const courses = [
  {
    icon: "briefcase" as const,
    title: "Freelancing &",
    text: "Remote Work",
    sub: "Online kaam seekho aur earning shuru karo",
    tone: styles.purple,
  },
  {
    icon: "store" as const,
    title: "Business &",
    text: "Entrepreneurship",
    sub: "Apna business samjho aur grow karo",
    tone: styles.green,
  },
  {
    icon: "megaphone" as const,
    title: "Marketing,",
    text: "Content & Growth",
    sub: "Apna brand banao aur audience tak pahuche",
    tone: styles.orange,
  },
  {
    icon: "user" as const,
    title: "Career &",
    text: "Employability",
    sub: "Naukri ke liye skills seekho aur ready ho jao",
    tone: styles.blue,
  },
];

export default function MainLanding2Page(): ReactElement {
  return (
    <main className={styles.page}>
      <div className={styles.aboveFold}>
        <section className={styles.hero} aria-labelledby="premium-hero-heading">
          <h1 id="premium-hero-heading" className={styles.visuallyHidden}>
            Learn AI Skills through games for better earning
          </h1>
          <Image
            src="/landing/skillup-premium-banner.jpg"
            alt="SkillUp Premium: Learn AI Skills through games for better earning. Game khelo, Skill seekho, Zyada kamao. Trusted by learners across Pakistan."
            width={780}
            height={312}
            className={styles.bannerImage}
            priority
            sizes="(max-width: 900px) 100vw, 900px"
          />
        </section>

        <section className={styles.paymentCard} aria-labelledby="payment-heading">
          <h2 id="payment-heading" className={styles.paymentTitle}>
            <span className={styles.phoneIcon}>
              <Icon name="phone" />
            </span>
            Enter Your JazzCash Number
          </h2>

          <form className={styles.paymentForm} action="/en/pricing" method="get">
            <label className={styles.inputWrap} htmlFor="jazzcash-number">
              <span className={styles.jazzcashLogo}>
                <Image
                  src="/landing/jazzcash-logo.png"
                  alt="JazzCash"
                  width={320}
                  height={320}
                  className={styles.jazzcashLogoImg}
                />
              </span>
              <span className={styles.inputDivider} aria-hidden="true" />
              <input
                id="jazzcash-number"
                name="msisdn"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="03XX XXXXXXX"
                className={styles.phoneInput}
                aria-label="JazzCash mobile number"
              />
            </label>

            <label className={styles.terms}>
              <input type="checkbox" name="agree" value="1" defaultChecked required />
              <span className={styles.check} aria-hidden="true">
                ✓
              </span>
              <span>
                I agree to Skillup <Link href="/en/legal/terms">Terms and Conditions</Link>
              </span>
            </label>

            <button type="submit" className={styles.pay}>
              <span className={styles.payLock}>
                <Icon name="lock" />
              </span>
              Subscribe Now
              <span className={styles.payArrow}>
                <Icon name="arrow" />
              </span>
            </button>
          </form>

          <div className={styles.notice}>
            <div className={styles.noticeIcon} aria-hidden="true">
              <Icon name="megaphone" />
            </div>
            <p>
              Subscribe Now click kertay he Rs.1 kat lia jae ga. Ye limited offer sirf aj k din k
              liye valid hai. Us k bad PKR 599/m lago hun gay.
            </p>
            <span className={styles.noticeStripes} aria-hidden="true" />
          </div>
        </section>
      </div>

      <ScrollReveal>
        <section className={styles.learning} aria-labelledby="learn-heading">
          <div className={styles.sectionHeading}>
            <span />
            <h2 id="learn-heading">What You Can Learn</h2>
            <span />
          </div>
          <div className={styles.courseGrid}>
            {courses.map((course) => (
              <article className={styles.course} key={course.title}>
                <div className={`${styles.courseIcon} ${course.tone}`}>
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

          <div className={`${styles.sectionHeading} ${styles.sectionHeadingSmall}`}>
            <span />
            <h2>... and much more</h2>
            <span />
          </div>

          <div className={styles.trustRow}>
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

          <p className={styles.privacy}>
            Jari rakhne se aap Skillup ki <Link href="/en/legal/terms">Terms and Conditions</Link>{" "}
            aur <Link href="/en/legal/privacy">Privacy Policy</Link> se raazi hoon.
          </p>
        </section>
      </ScrollReveal>
    </main>
  );
}
