"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./progress.module.css";

type Recommendation = Readonly<{
  generatedAt: string;
  policyVersion: "deterministic-v1";
  mode: "resume" | "remediate" | "continue" | "explore" | "complete";
  recommendation: Readonly<{
    levelId: string;
    levelVersionId: string;
    title: string;
    skillSlug: string;
    pathSlug: string;
    reason: string;
    evidence: readonly string[];
    startAllowedToday: boolean;
  }> | null;
  alternatives: readonly Readonly<{
    levelId: string;
    title: string;
    skillSlug: string;
    pathSlug: string;
  }>[];
  capability: Readonly<{
    tier: "free" | "premium";
    missionsRemainingToday: number | null;
    aiPersonalization: boolean;
  }>;
}>;

export function RecommendationCard({ locale }: Readonly<{ locale: "en" | "ur" }>) {
  const [view, setView] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/progress/recommendation", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.replace(`/${locale}/sign-in`);
          return null;
        }
        if (!response.ok) throw new Error("Your next learning step could not be calculated.");
        return (await response.json()) as Recommendation;
      })
      .then((result) => {
        if (result) setView(result);
      })
      .catch((requestError) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Your next learning step is unavailable.",
          );
        }
      });
    return () => controller.abort();
  }, [locale]);

  if (error) {
    return (
      <section className={styles["panel"]} role="status">
        <h2>Next learning step unavailable</h2>
        <p>{error}</p>
        <p>Your saved progress remains available below.</p>
      </section>
    );
  }

  if (!view) {
    return (
      <section className={styles["panel"]} aria-live="polite">
        Calculating an eligible next learning step…
      </section>
    );
  }

  if (!view.recommendation) {
    return (
      <section className={styles["resumeCard"]} aria-labelledby="recommendation-complete-title">
        <div>
          <p className={styles["eyebrow"]}>Deterministic recommendation</p>
          <h2 id="recommendation-complete-title">No incomplete eligible level was found.</h2>
          <p>
            Review completed levels, explore another published skill path, or return after new
            reviewed content is published.
          </p>
        </div>
        <Link className={styles["primaryButton"]} href={`/${locale}/skills`}>
          Browse reviewed skills
        </Link>
      </section>
    );
  }

  const recommendation = view.recommendation;
  return (
    <section className={styles["resumeCard"]} aria-labelledby="recommendation-title">
      <div>
        <p className={styles["eyebrow"]}>
          Recommended next step · {view.policyVersion.replaceAll("-", " ")}
        </p>
        <h2 id="recommendation-title">{recommendation.title}</h2>
        <p>{recommendation.reason}</p>
        <ul>
          {recommendation.evidence.map((evidence) => (
            <li key={evidence}>{evidence}</li>
          ))}
        </ul>
        <p className={styles["privacyNote"]}>
          {view.capability.aiPersonalization
            ? "AI assistance is permitted by your privacy setting, but this recommendation was calculated without a model."
            : "This recommendation uses deterministic progress, prerequisite and capability rules only."}
        </p>
        {view.alternatives.length > 0 ? (
          <p>
            Alternatives:{" "}
            {view.alternatives.map((alternative, index) => (
              <span key={alternative.levelId}>
                {index > 0 ? " · " : ""}
                <Link href={`/${locale}/learn/${alternative.levelId}`}>{alternative.title}</Link>
              </span>
            ))}
          </p>
        ) : null}
      </div>
      <div>
        {recommendation.startAllowedToday ? (
          <Link
            className={styles["primaryButton"]}
            href={`/${locale}/learn/${recommendation.levelId}`}
          >
            {view.mode === "resume" ? "Resume exact level" : "Start recommended level"}
          </Link>
        ) : (
          <div>
            <p>
              The daily free mission allowance is currently used. Your recommendation remains saved
              for the next UTC mission day, or premium can unlock unlimited missions.
            </p>
            <Link className={styles["primaryButton"]} href={`/${locale}/pricing`}>
              Review premium options
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
