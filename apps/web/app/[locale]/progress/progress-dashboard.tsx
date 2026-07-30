"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import styles from "./progress.module.css";

type LeaderboardPeriod = "week" | "month" | "all_time";

type ProgressSummary = Readonly<{
  generatedAt: string;
  capabilities: Readonly<{
    tier: "free" | "premium";
    detailedLevelHistory: boolean;
    ledgerHistoryLimit: number;
    levelHistoryLimit: number;
    leaderboardAccess: boolean;
  }>;
  pointsBalance: number;
  streak: Readonly<{
    currentDays: number;
    longestDays: number;
    lastQualifiedDate: string | null;
    graceCredits: number;
    timezone: string;
  }>;
  badges: readonly Readonly<{
    key: string;
    title: string;
    description: string;
    unlockedAt: string;
    explanation: string;
  }>[];
  levels: readonly Readonly<{
    levelId: string;
    levelVersionId: string;
    title: string;
    bestAwardedPoints: number;
    maxPoints: number;
    completionCount: number;
    lastCompletedAt: string | null;
  }>[];
  resume: Readonly<{
    sessionId: string;
    levelId: string;
    title: string;
    currentChallengeOrdinal: number;
    awardedPoints: number;
    maxPoints: number;
    lastActivityAt: string;
  }> | null;
  leaderboard: Readonly<{
    leaderboardOptIn: boolean;
    leaderboardAlias: string | null;
    leaderboardStatus: "eligible" | "suspended";
  }>;
}>;

type Ledger = Readonly<{
  limit: number;
  entries: readonly Readonly<{
    id: string;
    pointsDelta: number;
    reasonCode: string;
    explanation: string;
    sourceType: "level_completion" | "badge" | "manual_adjustment" | "correction";
    occurredAt: string;
    correctionOfId: string | null;
  }>[];
}>;

type Leaderboard = Readonly<{
  period: LeaderboardPeriod;
  generatedAt: string;
  entries: readonly Readonly<{ rank: number; alias: string; points: number }>[];
}>;

type ProgressDashboardProps = Readonly<{ locale: "en" | "ur" }>;

async function apiJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = "The request could not be completed.";
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") message = body.message;
    } catch {
      // The response may not contain JSON.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function readableDate(value: string | null): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function ProgressDashboard({ locale }: ProgressDashboardProps) {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);
  const [leaderboardAlias, setLeaderboardAlias] = useState("");

  const loadDashboard = useCallback(
    async (selectedPeriod: LeaderboardPeriod, showLoading: boolean) => {
      if (showLoading) setLoading(true);
      setMessage(null);
      try {
        const responses = await Promise.all([
          fetch("/api/v1/progress/summary", { credentials: "same-origin", cache: "no-store" }),
          fetch("/api/v1/progress/ledger", { credentials: "same-origin", cache: "no-store" }),
          fetch(`/api/v1/progress/leaderboard?period=${selectedPeriod}`, {
            credentials: "same-origin",
            cache: "no-store",
          }),
        ]);
        if (responses.some((response) => response.status === 401)) {
          window.location.replace(`/${locale}/sign-in`);
          return;
        }

        const [nextSummary, nextLedger, nextLeaderboard] = await Promise.all([
          apiJson<ProgressSummary>(responses[0]),
          apiJson<Ledger>(responses[1]),
          apiJson<Leaderboard>(responses[2]),
        ]);
        setSummary(nextSummary);
        setLedger(nextLedger);
        setLeaderboard(nextLeaderboard);
        setTimezone(nextSummary.streak.timezone);
        setLeaderboardOptIn(nextSummary.leaderboard.leaderboardOptIn);
        setLeaderboardAlias(nextSummary.leaderboard.leaderboardAlias ?? "");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Your progress could not be loaded.");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [locale],
  );

  useEffect(() => {
    void loadDashboard(period, true);
  }, [loadDashboard, period]);

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/progress/preferences", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timezone,
          leaderboardOptIn,
          leaderboardAlias: leaderboardAlias.trim() || null,
        }),
      });
      if (response.status === 401) {
        window.location.replace(`/${locale}/sign-in`);
        return;
      }
      await apiJson(response);
      await loadDashboard(period, false);
      setMessage("Your private progress preferences were saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your preferences could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function resumeLevel() {
    if (!summary?.resume) return;
    window.sessionStorage.setItem(
      `skillup:level-session:${summary.resume.levelId}`,
      summary.resume.sessionId,
    );
    window.location.assign(`/${locale}/learn/${summary.resume.levelId}`);
  }

  if (loading) {
    return (
      <section className={styles["loading"]} aria-live="polite">
        <h1>Loading your progress…</h1>
        <p>SkillUp is retrieving your private, server-verified learning record.</p>
      </section>
    );
  }

  if (!summary || !ledger || !leaderboard) {
    return (
      <section className={styles["loading"]} role="alert">
        <h1>Your progress is unavailable</h1>
        <p>{message ?? "The private progress record could not be loaded safely."}</p>
        <button className={styles["primaryButton"]} type="button" onClick={() => void loadDashboard(period, true)}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className={styles["dashboard"]}>
      <section className={styles["intro"]} aria-labelledby="progress-title">
        <div>
          <p className={styles["eyebrow"]}>Private learning record</p>
          <h1 id="progress-title">Your progress, clearly explained.</h1>
          <p className={styles["summary"]}>
            Points, streaks and achievements are calculated from verified server events. Device clock
            changes and replayed requests cannot add rewards.
          </p>
        </div>
        <span className={styles["tierBadge"]}>{summary.capabilities.tier} progress view</span>
      </section>

      <section className={styles["metrics"]} aria-label="Progress summary">
        <article className={styles["metricCard"]}>
          <span>Verified points</span>
          <strong>{summary.pointsBalance}</strong>
          <p>Append-only balance</p>
        </article>
        <article className={styles["metricCard"]}>
          <span>Current streak</span>
          <strong>{summary.streak.currentDays}</strong>
          <p>{summary.streak.currentDays === 1 ? "local day" : "local days"}</p>
        </article>
        <article className={styles["metricCard"]}>
          <span>Longest streak</span>
          <strong>{summary.streak.longestDays}</strong>
          <p>{summary.streak.graceCredits} grace credit available</p>
        </article>
      </section>

      {summary.resume ? (
        <section className={styles["resumeCard"]} aria-labelledby="resume-title">
          <div>
            <p className={styles["eyebrow"]}>Continue learning</p>
            <h2 id="resume-title">{summary.resume.title}</h2>
            <p>
              Challenge {summary.resume.currentChallengeOrdinal + 1} · {summary.resume.awardedPoints}/
              {summary.resume.maxPoints} points saved
            </p>
          </div>
          <button className={styles["primaryButton"]} type="button" onClick={resumeLevel}>
            Resume exact session
          </button>
        </section>
      ) : null}

      <div className={styles["contentGrid"]}>
        <section className={styles["panel"]} aria-labelledby="levels-title">
          <div className={styles["panelHeading"]}>
            <div>
              <p className={styles["eyebrow"]}>Saved mastery</p>
              <h2 id="levels-title">Recent completed levels</h2>
            </div>
            <span>{summary.capabilities.levelHistoryLimit} shown</span>
          </div>
          {summary.levels.length > 0 ? (
            <ul className={styles["recordList"]}>
              {summary.levels.map((level) => (
                <li key={level.levelVersionId}>
                  <div>
                    <strong>{level.title}</strong>
                    <span>Last completed {readableDate(level.lastCompletedAt)}</span>
                  </div>
                  <span className={styles["scorePill"]}>
                    {level.bestAwardedPoints}/{level.maxPoints}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles["empty"]}>Complete a reviewed level to create your first progress record.</p>
          )}
        </section>

        <section className={styles["panel"]} aria-labelledby="badges-title">
          <div className={styles["panelHeading"]}>
            <div>
              <p className={styles["eyebrow"]}>Evidence-backed rewards</p>
              <h2 id="badges-title">Achievements</h2>
            </div>
          </div>
          {summary.badges.length > 0 ? (
            <ul className={styles["badgeList"]}>
              {summary.badges.map((badge) => (
                <li key={badge.key}>
                  <span aria-hidden="true">★</span>
                  <div>
                    <strong>{badge.title}</strong>
                    <p>{badge.description}</p>
                    <small>{badge.explanation}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles["empty"]}>Your first verified completion can unlock an achievement.</p>
          )}
        </section>
      </div>

      <div className={styles["contentGrid"]}>
        <section className={styles["panel"]} aria-labelledby="ledger-title">
          <div className={styles["panelHeading"]}>
            <div>
              <p className={styles["eyebrow"]}>Auditable history</p>
              <h2 id="ledger-title">Why your points changed</h2>
            </div>
            <span>Latest {ledger.limit}</span>
          </div>
          {ledger.entries.length > 0 ? (
            <ul className={styles["ledgerList"]}>
              {ledger.entries.map((entry) => (
                <li key={entry.id}>
                  <span className={entry.pointsDelta >= 0 ? styles["positive"] : styles["negative"]}>
                    {entry.pointsDelta > 0 ? "+" : ""}
                    {entry.pointsDelta}
                  </span>
                  <div>
                    <strong>{entry.explanation}</strong>
                    <small>{readableDate(entry.occurredAt)}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles["empty"]}>No verified point events have been recorded yet.</p>
          )}
        </section>

        <section className={styles["panel"]} aria-labelledby="leaderboard-title">
          <div className={styles["panelHeading"]}>
            <div>
              <p className={styles["eyebrow"]}>Aliases only</p>
              <h2 id="leaderboard-title">Opt-in leaderboard</h2>
            </div>
            <select
              className={styles["compactSelect"]}
              aria-label="Leaderboard period"
              value={period}
              onChange={(event) => setPeriod(event.target.value as LeaderboardPeriod)}
            >
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="all_time">All time</option>
            </select>
          </div>
          {leaderboard.entries.length > 0 ? (
            <ol className={styles["leaderboardList"]}>
              {leaderboard.entries.map((entry) => (
                <li key={entry.alias}>
                  <span>#{entry.rank}</span>
                  <strong>{entry.alias}</strong>
                  <span>{entry.points} pts</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles["empty"]}>No eligible learners have opted into this period yet.</p>
          )}
          <p className={styles["privacyNote"]}>
            Real names, ages, contact details and learning history are never shown here.
          </p>
        </section>
      </div>

      <section className={styles["panel"]} aria-labelledby="preferences-title">
        <div className={styles["panelHeading"]}>
          <div>
            <p className={styles["eyebrow"]}>Privacy and day boundaries</p>
            <h2 id="preferences-title">Progress preferences</h2>
          </div>
        </div>
        <form className={styles["preferencesForm"]} onSubmit={savePreferences}>
          <label>
            <span>Your IANA timezone</span>
            <input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Asia/Karachi"
              required
            />
            <small>Streak days are calculated on the server using this timezone.</small>
          </label>
          <label>
            <span>Public alias</span>
            <input
              value={leaderboardAlias}
              onChange={(event) => setLeaderboardAlias(event.target.value)}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,23}"
              required={leaderboardOptIn}
              placeholder="Learner-1234"
            />
            <small>3–24 letters, numbers, underscores or hyphens. Never use contact details.</small>
          </label>
          <label className={styles["checkboxLabel"]}>
            <input
              type="checkbox"
              checked={leaderboardOptIn}
              onChange={(event) => setLeaderboardOptIn(event.target.checked)}
              disabled={summary.leaderboard.leaderboardStatus === "suspended"}
            />
            <span>Show this alias and verified points on eligible leaderboards.</span>
          </label>
          <button className={styles["primaryButton"]} type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save preferences"}
          </button>
        </form>
        <div className={styles["message"]} aria-live="polite">
          {message ? <p>{message}</p> : null}
        </div>
      </section>
    </div>
  );
}
