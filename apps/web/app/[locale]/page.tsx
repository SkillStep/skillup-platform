import { canonicalUrl } from "@skillup/discoverability";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { featuredPath, launchPaths } from "../../lib/home-content";
import { PublicFooter, PublicHeader } from "./discovery-shell";
import { HomePaymentBanner } from "./home-payment-banner";
import { HomeReveal } from "./home-reveal";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ payment?: string | string[]; orderId?: string | string[] }>;
}>;

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";

const learningSteps = [
  {
    number: "1",
    title: "Choose a goal",
    body: "Pick one practical skill path instead of a huge course library.",
    image: "/home/step-choose-goal.jpeg",
    alt: "Learner choosing a SkillUp goal on a laptop",
  },
  {
    number: "2",
    title: "Practice with challenges",
    body: "Work through short scenarios, quizzes and realistic decisions.",
    image: "/home/step-practice.jpeg",
    alt: "Hands practicing SkillUp challenges on a laptop",
  },
  {
    number: "3",
    title: "See your progress",
    body: "Understand mistakes, unlock levels and watch improvement over time.",
    image: "/home/step-progress.jpeg",
    alt: "Learner celebrating visible SkillUp progress",
  },
] as const;

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return [{ locale: "en" }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en") return {};

  return {
    title: "Practical skills through short learning games",
    description:
      "Build interview, English, AI, freelancing and digital marketing skills through short practical challenges.",
    alternates: {
      canonical: canonicalUrl(publicAppUrl, "en"),
    },
  };
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string" && entry.trim());
    return first?.trim() ?? null;
  }
  return null;
}

export default async function EnglishHomePage({ params, searchParams }: PageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (locale !== "en") notFound();

  const pilot = featuredPath();
  const payment = firstQueryValue(query.payment);
  const orderId = firstQueryValue(query.orderId);
  const featuredPaths = launchPaths.slice(0, 2);
  const morePaths = launchPaths.slice(2);

  return (
    <>
      <PublicHeader />
      <main className="home-main">
        <HomePaymentBanner payment={payment} orderId={orderId} />

        <section className="hero hero-modern" aria-labelledby="hero-title">
          <HomeReveal variant="fade-right" durationMs={900}>
            <div className="hero-copy">
              <p className="eyebrow">Practical learning for Pakistan</p>
              <h1 id="hero-title">
                Learn useful skills in short, focused{" "}
                <span className="accent-underline">games</span>.
              </h1>
              <p className="hero-summary">
                Choose a skill, complete realistic challenges, understand your mistakes and see
                progress after every session.
              </p>
              <div className="hero-actions">
                <Link className="button button-primary button-cta" href="/en/skills">
                  Explore Skills
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </HomeReveal>

          <HomeReveal variant="zoom-in" delayMs={120} durationMs={850}>
            <div className="hero-visual hero-visual-float">
              <div className="hero-visual-glow" aria-hidden="true" />
              <Image
                src="/home/home-hero-banner.png"
                alt="SkillUp learner on mobile with short skill cards for interview, digital and business learning"
                width={1248}
                height={727}
                className="hero-banner-image"
                priority
                sizes="(max-width: 820px) 100vw, 70vw"
              />
            </div>
          </HomeReveal>
        </section>

        <section className="section section-loop" id="how-it-works" aria-labelledby="how-title">
          <HomeReveal variant="fade-up" durationMs={700}>
            <div className="section-heading">
              <p className="eyebrow">A clear learning loop</p>
              <h2 id="how-title">
                Make progress in <span className="accent-underline">minutes</span>, not vague
                promises.
              </h2>
            </div>
          </HomeReveal>
          <div className="steps-grid steps-grid-visual">
            {learningSteps.map((step, index) => (
              <HomeReveal
                key={step.number}
                variant="zoom-in"
                delayMs={index * 120}
                durationMs={650}
              >
                <article className="step-card step-card-visual">
                  <div className="step-media">
                    <Image
                      src={step.image}
                      alt={step.alt}
                      width={640}
                      height={480}
                      className="step-image"
                      sizes="(max-width: 820px) 100vw, 33vw"
                    />
                    <span className="step-number">{step.number}</span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              </HomeReveal>
            ))}
          </div>
        </section>

        <section className="section" id="paths" aria-labelledby="paths-title">
          <HomeReveal variant="fade-up" durationMs={700}>
            <div className="section-heading section-heading-split">
              <div>
                <p className="eyebrow">Initial skill catalog</p>
                <h2 id="paths-title">Start with practical skills for real life.</h2>
              </div>
              <p>
                Five focused learning paths to build communication, English, digital and work-ready
                skills. The first complete pilot is {pilot.title}.
              </p>
            </div>
          </HomeReveal>

          <div className="path-grid path-grid-featured">
            {featuredPaths.map((path, index) => (
              <HomeReveal key={path.slug} variant="fade-up" delayMs={index * 140} durationMs={700}>
                <article className="path-card path-card-featured">
                  <div className="path-card-media" aria-hidden="true">
                    <Image
                      src={
                        path.status === "pilot"
                          ? "/home/step-choose-goal.jpeg"
                          : "/home/step-practice.jpeg"
                      }
                      alt=""
                      width={720}
                      height={420}
                      className="path-card-image"
                      sizes="(max-width: 820px) 100vw, 50vw"
                    />
                    <span
                      className={`status status-${path.status === "pilot" ? "pilot" : "planned"}`}
                    >
                      {path.status === "pilot" ? "First pilot" : "Planned"}
                    </span>
                  </div>
                  <div className="path-card-body">
                    <h3>{path.title}</h3>
                    <p>{path.summary}</p>
                    <ul className="path-features" aria-label="Path features">
                      <li>Short levels</li>
                      <li>Visible progress</li>
                    </ul>
                    <div className="hero-actions">
                      {path.status === "pilot" && path.levelId ? (
                        <Link className="button button-primary" href={`/en/learn/${path.levelId}`}>
                          Practice reviewed pilot
                          <span aria-hidden="true">→</span>
                        </Link>
                      ) : (
                        <Link className="button button-secondary" href={`/en/paths/${path.slug}`}>
                          View planned path
                          <span aria-hidden="true">→</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              </HomeReveal>
            ))}
          </div>

          {morePaths.length > 0 ? (
            <div className="more-paths">
              <HomeReveal variant="fade-up" durationMs={700}>
                <div className="section-heading">
                  <p className="eyebrow">More planned paths</p>
                  <h2>More skills on the way.</h2>
                  <p className="section-note">
                    Additional learning paths will be released after content review and learner
                    testing.
                  </p>
                </div>
              </HomeReveal>
              <div className="path-grid path-grid-more">
                {morePaths.map((path, index) => {
                  const morePathImage =
                    index === 0
                      ? "/home/step-progress.jpeg"
                      : index === 1
                        ? "/home/step-choose-goal.jpeg"
                        : "/home/step-practice.jpeg";

                  return (
                    <HomeReveal
                      key={path.slug}
                      variant="zoom-in"
                      delayMs={index * 110}
                      durationMs={650}
                    >
                      <article className="path-card path-card-compact">
                        <div className="path-card-media path-card-media-compact" aria-hidden="true">
                          <Image
                            src={morePathImage}
                            alt=""
                            width={640}
                            height={360}
                            className="path-card-image"
                            sizes="(max-width: 820px) 100vw, 33vw"
                          />
                          <span className="status status-planned">Planned</span>
                        </div>
                        <div className="path-card-body path-card-body-compact">
                          <h3>{path.title}</h3>
                          <p>{path.summary}</p>
                          <Link className="button button-secondary" href={`/en/paths/${path.slug}`}>
                            View planned path
                            <span aria-hidden="true">→</span>
                          </Link>
                        </div>
                      </article>
                    </HomeReveal>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <HomeReveal variant="fade-in" durationMs={800}>
          <section className="early-access" id="early-access" aria-labelledby="early-access-title">
            <div>
              <p className="eyebrow">Closed beta preparation</p>
              <h2 id="early-access-title">Help shape SkillUp for Pakistani learners.</h2>
              <p>
                Secure account, onboarding, gameplay and progress flows are ready for staged
                testing. Production sign-in email activates only with an approved sender domain and
                SMTP account.
              </p>
            </div>
            <Link className="button button-light" href="/en/sign-up">
              Sign up
            </Link>
          </section>
        </HomeReveal>
      </main>
      <PublicFooter />
    </>
  );
}
