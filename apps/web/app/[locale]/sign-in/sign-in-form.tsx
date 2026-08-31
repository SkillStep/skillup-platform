"use client";

import { type FormEvent, useEffect, useId, useState } from "react";

import { withReturnTo } from "../../../lib/return-to";
import styles from "../account-flow.module.css";

type ApiError = Readonly<{
  message?: string;
}>;

type ChallengeResponse = Readonly<{
  challengeId: string;
  expiresAt: string;
}>;

type VerifyResponse = Readonly<{
  learner?: Readonly<{
    profile?: Readonly<{
      onboardingStatus?: "not_started" | "in_progress" | "completed";
    }>;
  }>;
}>;

type SignInFormProps = Readonly<{
  returnTo: string;
}>;

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError;
    if (typeof body.message === "string" && body.message.length > 0) return body.message;
  } catch {
    // The response may not contain JSON.
  }
  return "This step is not available right now. Please try again later.";
}

export function SignInForm({ returnTo }: SignInFormProps) {
  const emailId = useId();
  const codeId = useId();
  const [hydrated, setHydrated] = useState(false);
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/auth/email/start", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        setIsError(true);
        setMessage(await readError(response));
        return;
      }

      const body = (await response.json()) as ChallengeResponse;
      setChallenge(body);
      setIsError(false);
      setMessage("Enter the four-digit code sent to your email address.");
    } catch {
      setIsError(true);
      setMessage("We could not reach SkillUp. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/auth/email/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, code }),
      });

      if (!response.ok) {
        setIsError(true);
        setMessage(await readError(response));
        return;
      }

      const body = (await response.json()) as VerifyResponse;
      const onboardingComplete = body.learner?.profile?.onboardingStatus === "completed";
      const destination = onboardingComplete ? returnTo : withReturnTo("/en/onboarding", returnTo);

      setIsError(false);
      setMessage(
        onboardingComplete
          ? "Signed in. Returning to your learning activity…"
          : "Signed in. Preparing your SkillUp profile…",
      );
      window.location.assign(destination);
    } catch {
      setIsError(true);
      setMessage("We could not verify the code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles["card"]}>
      <h2>{challenge ? "Check your email" : "Start with your email"}</h2>
      <p className={styles["cardLead"]}>
        {challenge
          ? `We sent a short-lived sign-in code to ${email}.`
          : "No password to remember. We will send a short-lived verification code."}
      </p>

      {challenge ? (
        <form className={styles["form"]} onSubmit={verify}>
          <div className={styles["codeGrid"]}>
            <div className={styles["field"]}>
              <label className={styles["label"]} htmlFor={codeId}>
                Four-digit code
              </label>
              <input
                className={styles["input"]}
                id={codeId}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{4}"
                maxLength={4}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
                required
              />
              <p className={styles["help"]}>
                The code expires shortly and stops working after five unsuccessful attempts.
              </p>
            </div>
            <button className={styles["action"]} type="submit" disabled={busy || code.length !== 4}>
              {busy ? "Verifying…" : "Verify and continue"}
            </button>
            <button
              className={styles["secondaryAction"]}
              type="button"
              disabled={busy}
              onClick={() => {
                setChallenge(null);
                setCode("");
                setMessage(null);
              }}
            >
              Use a different email
            </button>
          </div>
        </form>
      ) : (
        <form className={styles["form"]} onSubmit={start}>
          <div className={styles["field"]}>
            <label className={styles["label"]} htmlFor={emailId}>
              Email address
            </label>
            <input
              className={styles["input"]}
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <p className={styles["help"]}>Use an address you can access on this device.</p>
          </div>
          <button className={styles["action"]} type="submit" disabled={!hydrated || busy}>
            {busy ? "Requesting code…" : "Send sign-in code"}
          </button>
        </form>
      )}

      <div aria-live="polite" aria-atomic="true">
        {message ? (
          <p className={`${styles["message"]} ${isError ? styles["error"] : styles["success"]}`}>
            {message}
          </p>
        ) : null}
      </div>
      <p className={styles["privacy"]}>
        SkillUp does not return or log verification codes. Account existence is not disclosed by the
        request step.
      </p>
    </div>
  );
}
