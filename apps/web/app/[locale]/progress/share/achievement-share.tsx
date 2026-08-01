"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import styles from "./share.module.css";

type Badge = Readonly<{
  key: string;
  title: string;
  description: string;
  unlockedAt: string;
  explanation: string;
}>;

type ProgressSummary = Readonly<{
  badges: readonly Badge[];
  leaderboard: Readonly<{
    leaderboardOptIn: boolean;
    leaderboardAlias: string | null;
    leaderboardStatus: "eligible" | "suspended";
  }>;
}>;

type PrivacySettings = Readonly<{
  achievementSharing: boolean;
}>;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cardSvg(badge: Badge, alias: string): string {
  const title = escapeXml(badge.title);
  const description = escapeXml(badge.description);
  const learner = escapeXml(alias);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">${title} SkillUp achievement</title>
  <desc id="description">A privacy-safe achievement card for ${learner}.</desc>
  <rect width="1200" height="630" rx="48" fill="#f8fafc"/>
  <rect x="48" y="48" width="1104" height="534" rx="36" fill="#ffffff" stroke="#dbe4f0" stroke-width="3"/>
  <circle cx="180" cy="180" r="72" fill="#e0e7ff"/>
  <path d="M180 126l17 35 39 6-28 27 7 39-35-18-35 18 7-39-28-27 39-6z" fill="#4338ca"/>
  <text x="288" y="132" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#4338ca">VERIFIED SKILLUP ACHIEVEMENT</text>
  <text x="288" y="205" font-family="Arial, sans-serif" font-size="54" font-weight="800" fill="#0f172a">${title}</text>
  <text x="96" y="330" font-family="Arial, sans-serif" font-size="32" fill="#334155">${description}</text>
  <text x="96" y="448" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#0f172a">Earned by ${learner}</text>
  <text x="96" y="510" font-family="Arial, sans-serif" font-size="23" fill="#64748b">Generated from server-verified progress. No legal name, email or score is included.</text>
</svg>`;
}

function downloadSvg(badge: Badge, alias: string): void {
  const blob = new Blob([cardSvg(badge, alias)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `skillup-${badge.key}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (response.status === 401) {
    window.location.replace("/en/sign-in");
    throw new Error("Authentication is required.");
  }
  if (!response.ok) throw new Error("Achievement sharing data could not be loaded.");
  return (await response.json()) as T;
}

export function AchievementShare() {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchJson<ProgressSummary>("/api/v1/progress/summary", controller.signal),
      fetchJson<PrivacySettings>("/api/v1/account/privacy", controller.signal),
    ])
      .then(([progress, settings]) => {
        setSummary(progress);
        setPrivacy(settings);
        setSelectedKey(progress.badges[0]?.key ?? "");
      })
      .catch((requestError) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(requestError instanceof Error ? requestError.message : "Sharing is unavailable.");
        }
      });
    return () => controller.abort();
  }, []);

  const selectedBadge = useMemo(
    () => summary?.badges.find((badge) => badge.key === selectedKey) ?? null,
    [selectedKey, summary],
  );
  const approvedAlias =
    summary?.leaderboard.leaderboardOptIn &&
    summary.leaderboard.leaderboardStatus === "eligible" &&
    summary.leaderboard.leaderboardAlias
      ? summary.leaderboard.leaderboardAlias
      : "SkillUp learner";

  async function shareBadge(): Promise<void> {
    if (!selectedBadge) return;
    const text = `${approvedAlias} earned “${selectedBadge.title}” on SkillUp. ${selectedBadge.description}`;
    const url = `${window.location.origin}/en/skills`;
    if (navigator.share) {
      await navigator.share({ title: "SkillUp achievement", text, url });
      setStatus("Achievement shared using your device controls.");
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    setStatus("Privacy-safe achievement text copied.");
  }

  if (error) {
    return (
      <section className={styles["panel"]} role="alert">
        <h1>Achievement sharing unavailable</h1>
        <p>{error}</p>
        <Link href="/en/progress">Return to progress</Link>
      </section>
    );
  }

  if (!summary || !privacy) {
    return (
      <section className={styles["panel"]} aria-live="polite">
        Loading verified achievements…
      </section>
    );
  }

  if (!privacy.achievementSharing) {
    return (
      <section className={styles["panel"]}>
        <p className={styles["eyebrow"]}>Private by default</p>
        <h1>Achievement sharing is disabled.</h1>
        <p>
          Enable achievement sharing in account privacy controls before generating or sharing a
          card. Your legal name and email are never placed on the card.
        </p>
        <Link className={styles["primaryButton"]} href="/en/account">
          Review privacy controls
        </Link>
      </section>
    );
  }

  if (!selectedBadge) {
    return (
      <section className={styles["panel"]}>
        <h1>No earned achievement is available yet.</h1>
        <p>Complete a reviewed level to unlock a server-verified badge.</p>
        <Link className={styles["primaryButton"]} href="/en/skills">
          Continue learning
        </Link>
      </section>
    );
  }

  return (
    <section className={styles["layout"]}>
      <div className={styles["controls"]}>
        <p className={styles["eyebrow"]}>Verified and privacy-safe</p>
        <h1>Share an earned achievement</h1>
        <p>
          Only a server-verified badge and your approved public alias are used. Scores, email and
          legal name stay private.
        </p>
        <label htmlFor="achievement">Achievement</label>
        <select
          id="achievement"
          value={selectedKey}
          onChange={(event) => setSelectedKey(event.target.value)}
        >
          {summary.badges.map((badge) => (
            <option key={badge.key} value={badge.key}>
              {badge.title}
            </option>
          ))}
        </select>
        <div className={styles["actions"]}>
          <button type="button" onClick={() => void shareBadge()}>
            Share or copy
          </button>
          <button type="button" onClick={() => downloadSvg(selectedBadge, approvedAlias)}>
            Download SVG card
          </button>
        </div>
        <p className={styles["status"]} aria-live="polite">
          {status}
        </p>
      </div>

      <article className={styles["card"]} aria-label="Achievement card preview">
        <span className={styles["seal"]} aria-hidden="true">
          ★
        </span>
        <p className={styles["eyebrow"]}>Verified SkillUp achievement</p>
        <h2>{selectedBadge.title}</h2>
        <p>{selectedBadge.description}</p>
        <strong>Earned by {approvedAlias}</strong>
        <small>{selectedBadge.explanation}</small>
      </article>
    </section>
  );
}
