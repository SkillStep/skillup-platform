import { canonicalUrl } from "@skillup/discoverability";
import { BrandMark, Surface } from "@skillup/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { featuredPath, launchPaths } from "../../lib/home-content";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

const publicAppUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";

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

export default async function EnglishHomePage({ params }: PageProps) {
  const { locale } = await params;
  if (locale !== "en") notFound();

  const pilot = featuredPath();

  return (
    <main>
      <header className="site-header">
        <Link className="brand-link" href="/en" aria-label="SkillUp home">
          <BrandMark className="brand-mark" />
        </Link>
        <nav aria-label="Primary navigation" className="primary-nav">
          <a href="#paths">Explore skills</a>
          <a href="#how-it-works">How it works</a>
          <a className="nav-action" href="#early-access">
            Start learning
          </a>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Practical learning for Pakistan</p>
          <h1 id="hero-title">Learn useful skills in short, focused games.</h1>
          <p className="hero-summary">
            Choose a skill, complete realistic challenges, understand your mistakes and see progress
            after every session.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#early-access">
              Join early access
            </a>
            <a className="button button-secondary" href="#paths">
              Explore launch paths
            </a>
          </div>
          <ul className="trust-list" aria-label="SkillUp product commitments">
            <li>Mobile-first and lightweight</li>
            <li>Useful free learning every day</li>
            <li>English first, Urdu-ready</li>
          </ul>
        </div>

        <Surface className="level-preview" aria-labelledby="preview-title">
          <div className="level-preview-header">
            <span>Level preview</span>
            <span>2 min</span>
          </div>
          <p className="level-label">Interview communication</p>
          <h2 id="preview-title">Which answer gives the strongest evidence?</h2>
          <div className="answer-list" role="list" aria-label="Example answers">
            <div className="answer-option" role="listitem">
              I work hard and learn quickly.
            </div>
            <div className="answer-option answer-option-selected" role="listitem">
              I reduced weekly reporting time by creating a reusable template.
            </div>
            <div className="answer-option" role="listitem">
              I am confident that I can do everything required.
            </div>
          </div>
          <p className="preview-feedback">
            Strong answers show a specific action and result instead of relying on a general claim.
          </p>
        </Surface>
      </section>

      <section className="section" id="how-it-works" aria-labelledby="how-title">
        <div className="section-heading">
          <p className="eyebrow">A clear learning loop</p>
          <h2 id="how-title">Make progress in minutes, not vague promises.</h2>
        </div>
        <div className="steps-grid">
          <Surface className="step-card">
            <span className="step-number">1</span>
            <h3>Choose one practical goal</h3>
            <p>Start with a focused skill path rather than a huge course library.</p>
          </Surface>
          <Surface className="step-card">
            <span className="step-number">2</span>
            <h3>Practice through challenges</h3>
            <p>Work through scenarios, ordering, matching, short responses and recall.</p>
          </Surface>
          <Surface className="step-card">
            <span className="step-number">3</span>
            <h3>Understand and improve</h3>
            <p>Get an explanation, save progress and return to the areas that need work.</p>
          </Surface>
        </div>
      </section>

      <section className="section" id="paths" aria-labelledby="paths-title">
        <div className="section-heading section-heading-split">
          <div>
            <p className="eyebrow">Initial skill catalog</p>
            <h2 id="paths-title">Five focused paths for the first release.</h2>
          </div>
          <p>
            The first complete pilot is {pilot.title}. Other paths will publish only after content
            review and learner testing.
          </p>
        </div>
        <div className="path-grid">
          {launchPaths.map((path) => (
            <Surface className="path-card" key={path.slug}>
              <span className={`status status-${path.status}`}>
                {path.status === "pilot" ? "First pilot" : "Planned"}
              </span>
              <h3>{path.title}</h3>
              <p>{path.summary}</p>
              <span className="path-meta">
                Short levels · Practical feedback · Visible progress
              </span>
            </Surface>
          ))}
        </div>
      </section>

      <section className="early-access" id="early-access" aria-labelledby="early-access-title">
        <div>
          <p className="eyebrow">Closed beta preparation</p>
          <h2 id="early-access-title">Help shape SkillUp for Pakistani learners.</h2>
          <p>
            Early access registration will open after account privacy, content review and payment
            readiness gates pass.
          </p>
        </div>
        <span className="button button-light button-disabled" aria-disabled="true">
          Registration opening soon
        </span>
      </section>

      <footer className="site-footer">
        <BrandMark className="brand-mark brand-mark-footer" />
        <p>Learn. Play. Level Up.</p>
        <p>© {new Date().getUTCFullYear()} SkillUp. Working product preview.</p>
      </footer>
    </main>
  );
}
