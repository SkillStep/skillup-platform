"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { withReturnTo } from "../../../lib/return-to";
import styles from "./account.module.css";

type AccountSession = Readonly<{
  id: string;
  clientLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  idleExpiresAt: string;
  revokedAt: string | null;
  current: boolean;
}>;

type PrivacySettings = Readonly<{
  analyticsConsent: "essential" | "product";
  marketingConsent: boolean;
  leaderboardSharing: boolean;
  achievementSharing: boolean;
  aiPersonalization: boolean;
  updatedAt: string;
}>;

const currentPolicyVersion = "2026-08-01";

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

async function accountRequest(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...(init.headers ?? {}) }
      : init?.headers,
  });
  if (response.status === 401) {
    window.location.replace(withReturnTo("/en/sign-in", "/en/account"));
  }
  return response;
}

export function AccountControls() {
  const [sessions, setSessions] = useState<readonly AccountSession[]>([]);
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deletionDue, setDeletionDue] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const [sessionsResponse, privacyResponse] = await Promise.all([
        accountRequest("/account/sessions", { signal }),
        accountRequest("/account/privacy", { signal }),
      ]);
      if (!sessionsResponse.ok || !privacyResponse.ok) {
        throw new Error("Account controls are temporarily unavailable.");
      }
      const sessionBody = (await sessionsResponse.json()) as {
        sessions: readonly AccountSession[];
      };
      setSessions(sessionBody.sessions);
      setPrivacy((await privacyResponse.json()) as PrivacySettings);
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Account controls are unavailable.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function updatePrivacy(patch: Partial<PrivacySettings>): Promise<void> {
    if (!privacy) return;
    setSaving(true);
    setError(null);
    try {
      const response = await accountRequest("/account/privacy", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("Privacy preferences could not be saved.");
      setPrivacy((await response.json()) as PrivacySettings);
      setMessage("Privacy preferences saved.");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Privacy preferences failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function revokeSession(sessionId: string, current: boolean): Promise<void> {
    setError(null);
    const response = await accountRequest(`/account/sessions/${sessionId}`, { method: "DELETE" });
    if (!response.ok) {
      setError("The session could not be revoked.");
      return;
    }
    if (current) {
      window.location.replace(withReturnTo("/en/sign-in", "/en/account"));
      return;
    }
    setSessions((items) =>
      items.map((item) =>
        item.id === sessionId ? { ...item, revokedAt: new Date().toISOString() } : item,
      ),
    );
    setMessage("Session revoked.");
  }

  async function revokeAllSessions(): Promise<void> {
    setError(null);
    const response = await accountRequest("/account/sessions", { method: "DELETE" });
    if (!response.ok) {
      setError("Sessions could not be revoked.");
      return;
    }
    window.location.replace(withReturnTo("/en/sign-in", "/en/account"));
  }

  async function exportData(): Promise<void> {
    setError(null);
    setMessage("Preparing your private export…");
    const response = await accountRequest("/account/export", { method: "POST" });
    if (!response.ok) {
      setError("Your export could not be prepared.");
      return;
    }
    const payload = await response.json();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `skillup-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Your export was prepared and downloaded on this device.");
  }

  async function acceptPolicy(policyKey: string): Promise<void> {
    setError(null);
    const response = await accountRequest("/account/policies/accept", {
      method: "POST",
      body: JSON.stringify({
        policyKey,
        version: currentPolicyVersion,
        locale: "en",
        source: "account_settings",
      }),
    });
    if (!response.ok) {
      setError("The policy acknowledgement could not be recorded.");
      return;
    }
    setMessage("Policy acknowledgement recorded with version evidence.");
  }

  async function requestDeletion(): Promise<void> {
    if (!deleteConfirmed) {
      setError("Confirm that you understand the seven-day deletion cooldown.");
      return;
    }
    setError(null);
    const response = await accountRequest("/account/deletion", {
      method: "POST",
      body: JSON.stringify({
        confirmation: "DELETE",
        ...(deleteReason.trim().length >= 3 ? { reason: deleteReason.trim() } : {}),
      }),
    });
    if (!response.ok) {
      setError("The deletion request could not be created.");
      return;
    }
    const result = (await response.json()) as { executeAfter: string };
    setDeletionDue(result.executeAfter);
    setMessage("Account deletion is scheduled. You can cancel it during the cooldown.");
  }

  async function cancelDeletion(): Promise<void> {
    setError(null);
    const response = await accountRequest("/account/deletion", { method: "DELETE" });
    if (!response.ok) {
      setError("No cancellable deletion request was found.");
      return;
    }
    setDeletionDue(null);
    setDeleteConfirmed(false);
    setMessage("Account deletion cancelled.");
  }

  if (loading) return <section className={styles["panel"]}>Loading account controls…</section>;

  return (
    <>
      {message ? <p className={styles["message"]}>{message}</p> : null}
      {error ? (
        <p className={`${styles["message"]} ${styles["error"]}`} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles["panel"]} aria-labelledby="privacy-settings-title">
        <h2 id="privacy-settings-title">Privacy and sharing</h2>
        <p>
          Essential security and transaction records always remain enabled. Optional uses are
          controlled below.
        </p>
        {privacy ? (
          <div className={styles["settingsGrid"]}>
            <label className={styles["setting"]}>
              <input
                type="checkbox"
                checked={privacy.analyticsConsent === "product"}
                disabled={saving}
                onChange={(event) =>
                  void updatePrivacy({
                    analyticsConsent: event.currentTarget.checked ? "product" : "essential",
                  })
                }
              />
              <span>
                <strong>Product analytics</strong>
                <small>Help improve learning flows using minimized events.</small>
              </span>
            </label>
            <label className={styles["setting"]}>
              <input
                type="checkbox"
                checked={privacy.marketingConsent}
                disabled={saving}
                onChange={(event) =>
                  void updatePrivacy({ marketingConsent: event.currentTarget.checked })
                }
              />
              <span>
                <strong>Marketing messages</strong>
                <small>Receive optional SkillUp product communication.</small>
              </span>
            </label>
            <label className={styles["setting"]}>
              <input
                type="checkbox"
                checked={privacy.leaderboardSharing}
                disabled={saving}
                onChange={(event) =>
                  void updatePrivacy({ leaderboardSharing: event.currentTarget.checked })
                }
              />
              <span>
                <strong>Leaderboard alias</strong>
                <small>Share only an approved alias and verified points.</small>
              </span>
            </label>
            <label className={styles["setting"]}>
              <input
                type="checkbox"
                checked={privacy.achievementSharing}
                disabled={saving}
                onChange={(event) =>
                  void updatePrivacy({ achievementSharing: event.currentTarget.checked })
                }
              />
              <span>
                <strong>Achievement sharing</strong>
                <small>Allow privacy-safe public achievement cards.</small>
              </span>
            </label>
            <label className={styles["setting"]}>
              <input
                type="checkbox"
                checked={privacy.aiPersonalization}
                disabled={saving}
                onChange={(event) =>
                  void updatePrivacy({ aiPersonalization: event.currentTarget.checked })
                }
              />
              <span>
                <strong>AI-assisted recommendations</strong>
                <small>
                  Allow approved model assistance after deterministic eligibility checks.
                </small>
              </span>
            </label>
          </div>
        ) : null}
      </section>

      <section className={styles["panel"]} aria-labelledby="sessions-title">
        <div className={styles["sectionHeading"]}>
          <div>
            <h2 id="sessions-title">Active devices and sessions</h2>
            <p>Revoke access you no longer recognize or use.</p>
          </div>
          <button
            className={`${styles["button"]} ${styles["secondary"]}`}
            type="button"
            onClick={() => void revokeAllSessions()}
          >
            Sign out everywhere
          </button>
        </div>
        <ul className={styles["sessionList"]}>
          {sessions.map((session) => (
            <li key={session.id}>
              <div>
                <strong>
                  {session.clientLabel ?? "Web browser"}
                  {session.current ? " — current" : ""}
                </strong>
                <span>
                  Last used {dateTimeLabel(session.lastSeenAt)} · expires{" "}
                  {dateTimeLabel(session.idleExpiresAt)}
                </span>
                {session.revokedAt ? <span>Revoked {dateTimeLabel(session.revokedAt)}</span> : null}
              </div>
              {!session.revokedAt ? (
                <button
                  className={`${styles["button"]} ${styles["secondary"]}`}
                  type="button"
                  onClick={() => void revokeSession(session.id, session.current)}
                >
                  Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles["panel"]} aria-labelledby="policies-title">
        <h2 id="policies-title">Policies and disclosures</h2>
        <p>
          These provisional launch documents are versioned. Final legal copy can replace them
          without rewriting your evidence.
        </p>
        <div className={styles["policyGrid"]}>
          {[
            ["terms", "Terms of Use"],
            ["privacy", "Privacy Notice"],
            ["refund", "Refund and Cancellation"],
            ["ai-disclosure", "AI Use Disclosure"],
            ["sharing", "Leaderboard and Sharing"],
            ["fair-use", "Fair Use"],
          ].map(([slug, title]) => (
            <div className={styles["policyCard"]} key={slug}>
              <Link href={`/en/legal/${slug}`}>{title}</Link>
              <button
                className={styles["textButton"]}
                type="button"
                onClick={() =>
                  void acceptPolicy(
                    slug === "ai-disclosure"
                      ? "ai_disclosure"
                      : slug === "sharing"
                        ? "leaderboard_sharing"
                        : slug.replaceAll("-", "_"),
                  )
                }
              >
                Record acknowledgement
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={styles["panel"]} aria-labelledby="export-title">
        <h2 id="export-title">Download your data</h2>
        <p>
          The export contains bounded account, preference, session, progress and payment-reference
          data. It excludes credentials and protected answer logic.
        </p>
        <button className={styles["button"]} type="button" onClick={() => void exportData()}>
          Prepare private JSON export
        </button>
      </section>

      <section
        className={`${styles["panel"]} ${styles["dangerPanel"]}`}
        aria-labelledby="deletion-title"
      >
        <h2 id="deletion-title">Delete your account</h2>
        <p>
          Deletion has a seven-day cooldown. Sessions and personal profile data are removed or
          pseudonymized; required payment and audit evidence is retained.
        </p>
        {deletionDue ? (
          <div>
            <p>
              <strong>Scheduled for {dateTimeLabel(deletionDue)}</strong>
            </p>
            <button
              className={`${styles["button"]} ${styles["secondary"]}`}
              type="button"
              onClick={() => void cancelDeletion()}
            >
              Cancel deletion
            </button>
          </div>
        ) : (
          <div className={styles["deletionForm"]}>
            <label>
              Optional reason
              <textarea
                value={deleteReason}
                maxLength={500}
                onChange={(event) => setDeleteReason(event.currentTarget.value)}
              />
            </label>
            <label className={styles["setting"]}>
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(event) => setDeleteConfirmed(event.currentTarget.checked)}
              />
              <span>
                <strong>I understand the cooldown and retained records.</strong>
              </span>
            </label>
            <button
              className={`${styles["button"]} ${styles["dangerButton"]}`}
              type="button"
              onClick={() => void requestDeletion()}
            >
              Schedule account deletion
            </button>
          </div>
        )}
      </section>
    </>
  );
}
