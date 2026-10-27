"use client";

import { type FormEvent, useEffect, useId, useState } from "react";

import { LANDING_MSISDN_STORAGE_KEY } from "../../../lib/jazzcash-checkout";
import { withReturnTo } from "../../../lib/return-to";
import styles from "../account-flow.module.css";

type ApiError = Readonly<{ message?: string }>;

type VerifyResponse = Readonly<{
  learner?: Readonly<{
    profile?: Readonly<{
      onboardingStatus?: "not_started" | "in_progress" | "completed";
    }>;
  }>;
}>;

type SignInFormProps = Readonly<{
  returnTo: string;
  /** Admin login skips learner onboarding and uses operator-facing copy. */
  mode?: "learner" | "admin";
}>;

function isStrongPassword(password: string): boolean {
  return (
    password.length >= 7 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError;
    if (typeof body.message === "string" && body.message.length > 0) return body.message;
  } catch {
    // The response may not contain JSON.
  }
  return "This step is not available right now. Please try again later.";
}

export function SignInForm({ returnTo, mode = "learner" }: SignInFormProps) {
  const fullNameId = useId();
  const phoneId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const [hydrated, setHydrated] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const isAdmin = mode === "admin";

  useEffect(() => {
    setHydrated(true);
    if (isAdmin) return;
    // Prefill only when JazzCash checkout already stored the MSISDN (pay-first return).
    try {
      const saved = window.sessionStorage.getItem(LANDING_MSISDN_STORAGE_KEY);
      if (saved && /^\d{11,15}$/.test(saved)) {
        setPhone(saved);
      }
    } catch {
      // Ignore storage access failures.
    }
  }, [isAdmin]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setIsError(true);
      setMessage("Enter your full name (at least 2 characters).");
      return;
    }
    if (!isStrongPassword(password)) {
      setIsError(true);
      setMessage(
        "Password must be at least 7 characters and include upper, lower, number and symbol (e.g. Abc@123).",
      );
      return;
    }
    if (password !== confirmPassword) {
      setIsError(true);
      setMessage("Password and confirm password do not match.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/auth/password/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: trimmedName,
          phone: phone.trim(),
          password,
        }),
      });

      if (!response.ok) {
        setIsError(true);
        setMessage(await readError(response));
        return;
      }

      const body = (await response.json()) as VerifyResponse;
      const onboardingComplete = body.learner?.profile?.onboardingStatus === "completed";
      const destination = isAdmin
        ? returnTo
        : onboardingComplete
          ? returnTo
          : withReturnTo("/en/onboarding", returnTo);

      setIsError(false);
      setMessage(
        isAdmin
          ? "Signed in. Opening the operations console…"
          : onboardingComplete
            ? "Signed in. Returning to your learning activity…"
            : "Signed in. Preparing your SkillUp profile…",
      );
      window.location.assign(destination);
    } catch {
      setIsError(true);
      setMessage("We could not sign you in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (isAdmin) {
    return (
      <div className={styles["card"]}>
        <h2>Admin sign in</h2>
        <p className={styles["cardLead"]}>
          Operator access uses the admin email/password console, not learner mobile login.
        </p>
        <p className={styles["privacy"]}>Use /en/admin/sign-in for operator credentials.</p>
      </div>
    );
  }

  return (
    <div className={styles["card"]}>
      <h2>Sign in</h2>
      <p className={styles["cardLead"]}>
        Enter your name, JazzCash mobile number and password. New numbers create an account.
      </p>

      <form className={styles["form"]} onSubmit={onSubmit}>
        <div className={styles["field"]}>
          <label className={styles["label"]} htmlFor={fullNameId}>
            Full name
          </label>
          <input
            className={styles["input"]}
            id={fullNameId}
            name="fullName"
            type="text"
            autoComplete="name"
            maxLength={60}
            minLength={2}
            placeholder="Your full name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </div>
        <div className={styles["field"]}>
          <label className={styles["label"]} htmlFor={phoneId}>
            Mobile number
          </label>
          <input
            className={styles["input"]}
            id={phoneId}
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={15}
            placeholder="03XXXXXXXXX"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
          <p className={styles["help"]}>
            Pakistan mobile formats such as 0300 1234567 and +923001234567 are accepted. Prefills
            after JazzCash checkout.
          </p>
        </div>
        <div className={styles["field"]}>
          <label className={styles["label"]} htmlFor={passwordId}>
            Password
          </label>
          <input
            className={styles["input"]}
            id={passwordId}
            name="password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            placeholder="Create or enter password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <p className={styles["help"]}>
            At least 7 characters with upper, lower, number and symbol (example: Abc@123).
          </p>
        </div>
        <div className={styles["field"]}>
          <label className={styles["label"]} htmlFor={confirmPasswordId}>
            Confirm password
          </label>
          <input
            className={styles["input"]}
            id={confirmPasswordId}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </div>
        <button
          className={styles["action"]}
          type="submit"
          disabled={
            !hydrated ||
            busy ||
            fullName.trim().length < 2 ||
            phone.trim().length < 10 ||
            password.length < 7 ||
            confirmPassword.length < 7
          }
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div aria-live="polite" aria-atomic="true">
        {message ? (
          <p className={`${styles["message"]} ${isError ? styles["error"] : styles["success"]}`}>
            {message}
          </p>
        ) : null}
      </div>
      <p className={styles["privacy"]}>
        Existing learners who previously used OTP can sign in with password Abc@123, then change it
        later from support if needed.
      </p>
    </div>
  );
}
