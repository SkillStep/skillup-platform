"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import styles from "./certificates.module.css";

type Award = Readonly<{
  id: string;
  publicId: string;
  title: string;
  completedAt: string;
  issuedAt: string;
  status: "issued" | "revoked";
}>;

type Eligibility = Readonly<{
  status: "unavailable" | "incomplete" | "eligible" | "earned";
  requiredLevels: number;
  completedLevels: number;
  requiredChallenges: number;
  passedChallenges: number;
  capstoneRequired: boolean;
  capstonePassed: boolean;
}>;

const skills = [
  ["interview-workplace-communication", "Interview and Workplace Communication"],
  ["practical-english-study-work", "Practical English for Study and Work"],
  ["ai-tools-study-work", "AI Tools for Study and Work"],
  ["freelancing-foundations", "Freelancing Foundations"],
  ["digital-marketing-foundations", "Digital Marketing Foundations"],
  ["prompt-engineering-generative-ai", "Prompt Engineering & Generative AI"],
  ["cybersecurity-digital-safety", "Cybersecurity & Digital Safety"],
  ["data-analytics-dashboards", "Data Analytics & Decision Making"],
  ["applied-ai-workflows", "AI Automation & No-Code Tools"],
  ["sales-client-negotiation", "Sales, Negotiation & Client Management"],
] as const;

function date(value: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Sign in to view your private certificates.");
    }
    throw new Error("Certificate records are unavailable. Please try again.");
  }
  return (await response.json()) as T;
}

export function MyCertificates() {
  const [awards, setAwards] = useState<readonly Award[]>([]);
  const [requirements, setRequirements] = useState<Readonly<Record<string, Eligibility>>>({});
  const [loading, setLoading] = useState(true);
  const [signInRequired, setSignInRequired] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setMessage(null);
    try {
      const response = await fetch("/api/v1/me/certificates", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 401) {
        setSignInRequired(true);
        setAwards([]);
        setRequirements({});
        return;
      }
      const owned = await responseJson<{ certificates: Award[] }>(response);
      setAwards(owned.certificates);
      setSignInRequired(false);

      const values = await Promise.all(
        skills.map(async ([slug]) => {
          const result = await fetch(`/api/v1/me/certificate-eligibility/${slug}`, {
            credentials: "same-origin",
            cache: "no-store",
          });
          const body = await responseJson<{ eligibility: Eligibility }>(result);
          return [slug, body.eligibility] as const;
        }),
      );
      setRequirements(Object.fromEntries(values));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Certificate records are unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function claim(slug: string) {
    setClaiming(slug);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/me/certificate-claims/${slug}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      if (!response.ok) {
        setMessage(
          response.status === 403
            ? "Certificate issuance is not open yet. Your verified progress is saved."
            : "Your certificate could not be issued. Please review your completion requirements.",
        );
      } else {
        await reload();
        setMessage("Your certificate has been issued from verified completion evidence.");
      }
    } catch {
      setMessage("Certificate claim is temporarily unavailable.");
    } finally {
      setClaiming(null);
    }
  }

  if (loading) return <p role="status">Loading your verified certificates…</p>;
  if (signInRequired) {
    return (
      <section className={styles["panel"]}>
        <h2>Sign in to see your certificates</h2>
        <p>Certificates and completion evidence are private to their owner.</p>
        <Link className={styles["action"]} href="/en/sign-in?returnTo=%2Fen%2Fcertificates">
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <div className={styles["sections"]}>
      {message ? <p role="status" className={styles["notice"]}>{message}</p> : null}
      <section className={styles["panel"]} aria-labelledby="earned-title">
        <div className={styles["sectionHead"]}>
          <h2 id="earned-title">Issued certificates</h2>
          <button type="button" className={styles["refresh"]} onClick={() => void reload()}>
            Refresh
          </button>
        </div>
        {awards.length === 0 ? (
          <p>
            No certificates have been issued yet. Complete a published course and its
            required verified assessment to become eligible.
          </p>
        ) : (
          <ul className={styles["awards"]}>
            {awards.map((award) => (
              <li key={award.id} className={styles["award"]}>
                <div>
                  <strong>{award.title}</strong>
                  <p>{award.status === "revoked" ? "Revoked" : "Verified issued"} · Issued {date(award.issuedAt)}</p>
                  <p className={styles["identifier"]}>{award.publicId}</p>
                </div>
                {award.status === "issued" ? (
                  <a className={styles["action"]} href={`/api/v1/me/certificates/${award.id}/pdf`}>
                    Download A4 PDF
                  </a>
                ) : (
                  <span className={styles["statusMuted"]}>Unavailable due to revocation</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles["panel"]} aria-labelledby="requirements-title">
        <h2 id="requirements-title">Completion requirements</h2>
        <p>Only server-verified results count. An upcoming outline is not a completed course.</p>
        <div className={styles["grid"]}>
          {skills.map(([slug, title]) => {
            const item = requirements[slug];
            const label = item?.status === "earned"
              ? "Certificate earned"
              : item?.status === "eligible"
                ? "Eligible for certificate"
                : item?.status === "incomplete"
                  ? "In progress"
                  : "Requirements not yet approved";
            return (
              <article key={slug} className={styles["skill"]}>
                <h3>{title}</h3>
                <p className={styles["state"]}>{label}</p>
                {item?.status === "incomplete" || item?.status === "eligible" ? (
                  <p>
                    {item.completedLevels} of {item.requiredLevels} levels ·{" "}
                    {item.passedChallenges} of {item.requiredChallenges} evaluated challenges
                    {item.capstoneRequired
                      ? item.capstonePassed ? " · Capstone approved" : " · Capstone pending"
                      : ""}
                  </p>
                ) : null}
                {item?.status === "eligible" ? (
                  <button
                    type="button"
                    className={styles["action"]}
                    disabled={claiming !== null}
                    onClick={() => void claim(slug)}
                  >
                    {claiming === slug ? "Verifying…" : "Claim certificate"}
                  </button>
                ) : null}
                {item?.status === "incomplete" ? (
                  <Link href="/en/skills" className={styles["secondary"]}>Continue learning</Link>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
