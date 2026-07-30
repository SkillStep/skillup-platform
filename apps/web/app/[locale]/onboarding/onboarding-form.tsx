"use client";

import { type FormEvent, useEffect, useId, useState } from "react";

import styles from "../account-flow.module.css";

type LearnerResponse = Readonly<{
  learner?: Readonly<{
    profile?: Readonly<{
      displayName?: string | null;
      locale?: "en" | "ur";
      ageBand?: "16_17" | "18_24" | "25_34" | "35_plus" | "unspecified";
      learningGoal?: string | null;
      onboardingStatus?: "not_started" | "in_progress" | "completed";
    }>;
  }>;
  message?: string;
}>;

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as LearnerResponse;
    if (typeof body.message === "string" && body.message.length > 0) return body.message;
  } catch {
    // The response may not contain JSON.
  }
  return "We could not save your profile right now.";
}

export function OnboardingForm() {
  const displayNameId = useId();
  const ageBandId = useId();
  const goalId = useId();
  const localeId = useId();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [ageBand, setAgeBand] = useState("unspecified");
  const [learningGoal, setLearningGoal] = useState("");
  const [locale, setLocale] = useState("en");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const response = await fetch("/api/v1/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.replace("/en/sign-in");
          return;
        }
        if (!response.ok) {
          setMessage(await readMessage(response));
          return;
        }

        const body = (await response.json()) as LearnerResponse;
        const profile = body.learner?.profile;
        setDisplayName(profile?.displayName ?? "");
        setAgeBand(profile?.ageBand ?? "unspecified");
        setLearningGoal(profile?.learningGoal ?? "");
        setLocale(profile?.locale ?? "en");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage(
            "We could not load your private profile. Check your connection and try again.",
          );
        }
      } finally {
        setLoading(false);
      }
    }

    void loadSession();
    return () => controller.abort();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName,
          ageBand,
          learningGoal,
          locale,
          onboardingStatus: "completed",
        }),
      });

      if (!response.ok) {
        setMessage(await readMessage(response));
        return;
      }

      window.location.assign("/en");
    } catch {
      setMessage("We could not save your profile. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={styles["card"]} aria-live="polite">
        <h2>Loading your private profile…</h2>
        <p className={styles["cardLead"]}>This page is never indexed or cached publicly.</p>
      </div>
    );
  }

  return (
    <div className={styles["card"]}>
      <div
        className={styles["progress"]}
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={2}
        aria-valuetext="Step 2 of 3"
      >
        <span>Step 2 of 3</span>
        <span className={styles["progressBar"]} aria-hidden="true">
          <span className={styles["progressValue"]} />
        </span>
      </div>
      <h2>Shape your first learning path</h2>
      <p className={styles["cardLead"]}>
        A few details help SkillUp recommend practical challenges without creating a heavy profile.
      </p>

      <form className={styles["form"]} onSubmit={save}>
        <div className={styles["field"]}>
          <label className={styles["label"]} htmlFor={displayNameId}>
            What should we call you?
          </label>
          <input
            className={styles["input"]}
            id={displayNameId}
            name="displayName"
            autoComplete="name"
            minLength={2}
            maxLength={60}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </div>

        <div className={styles["field"]}>
          <label className={styles["label"]} htmlFor={ageBandId}>
            Age group
          </label>
          <select
            className={styles["select"]}
            id={ageBandId}
            name="ageBand"
            value={ageBand}
            onChange={(event) => setAgeBand(event.target.value)}
          >
            <option value="unspecified">Prefer not to say</option>
            <option value="16_17">16–17</option>
            <option value="18_24">18–24</option>
            <option value="25_34">25–34</option>
            <option value="35_plus">35+</option>
          </select>
          <p className={styles["help"]}>
            SkillUp’s first beta is designed for learners aged 16 and above.
          </p>
        </div>

        <div className={styles["field"]}>
          <label className={styles["label"]} htmlFor={goalId}>
            What do you want to achieve first?
          </label>
          <textarea
            className={styles["textarea"]}
            id={goalId}
            name="learningGoal"
            minLength={3}
            maxLength={240}
            placeholder="For example: prepare for my first job interview"
            value={learningGoal}
            onChange={(event) => setLearningGoal(event.target.value)}
            required
          />
        </div>

        <div className={styles["field"]}>
          <label className={styles["label"]} htmlFor={localeId}>
            Learning language
          </label>
          <select
            className={styles["select"]}
            id={localeId}
            name="locale"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            <option value="en">English</option>
            <option value="ur" disabled>
              Urdu — coming after content review
            </option>
          </select>
        </div>

        <button className={styles["action"]} type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
      </form>

      <div aria-live="polite" aria-atomic="true">
        {message ? <p className={`${styles["message"]} ${styles["error"]}`}>{message}</p> : null}
      </div>
      <p className={styles["privacy"]}>
        Your age group and learning goal are private profile data. They are not published or
        indexed.
      </p>
    </div>
  );
}
