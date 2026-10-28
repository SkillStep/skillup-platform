"use client";

import type { Route } from "next";
import Link from "next/link";
import { type FormEvent, useEffect, useId, useState } from "react";

import { LANDING_MSISDN_STORAGE_KEY } from "../../../lib/jazzcash-checkout";
import { clearPremiumUnlockedFlag } from "../../../lib/premium-unlock";
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
  /** Homepage/nav entry is Sign up; dedicated Sign in page for returning learners. */
  intent?: "sign-up" | "sign-in";
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

export function SignInForm({ returnTo, mode = "learner", intent = "sign-in" }: SignInFormProps) {
  const fullNameId = useId();
  const phoneId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const [hydrated, setHydrated] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  /** Locked to the JazzCash landing number until password sign-in succeeds. */
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const isAdmin = mode === "admin";
  const isSignUp = intent === "sign-up";

  useEffect(() => {
    setHydrated(true);
    if (isAdmin) return;
    // Prefill + lock when JazzCash checkout already stored the MSISDN (pay-first return).
    try {
      const saved = window.sessionStorage.getItem(LANDING_MSISDN_STORAGE_KEY);
      if (saved && /^\d{11,15}$/.test(saved)) {
        setPhone(saved);
        setPhoneLocked(true);
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
    if (isSignUp && password !== confirmPassword) {
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

      try {
        window.sessionStorage.removeItem(LANDING_MSISDN_STORAGE_KEY);
      } catch {
        // Ignore storage access failures.
      }
      clearPremiumUnlockedFlag();
      setPhoneLocked(false);

      setIsError(false);
      setMessage(
        isAdmin
          ? "Signed in. Opening the operations console…"
          : isSignUp
            ? onboardingComplete
              ? "Account ready. Returning to your learning activity…"
              : "Account ready. Preparing your SkillUp profile…"
            : onboardingComplete
              ? "Signed in. Returning to your learning activity…"
              : "Signed in. Preparing your SkillUp profile…",
      );
      window.location.assign(destination);
    } catch {
      setIsError(true);
      setMessage(
        isSignUp
          ? "We could not create your account. Check your connection and try again."
          : "We could not sign you in. Check your connection and try again.",
      );
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
      <h2>{isSignUp ? "Sign up" : "Sign in"}</h2>
      <p className={styles["cardLead"]}>
        {isSignUp
          ? "Enter your name, JazzCash mobile number and password to create your SkillUp account."
          : "Enter your name, JazzCash mobile number and password to continue learning."}
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
            onChange={(event) => {
              if (phoneLocked) return;
              setPhone(event.target.value);
            }}
            readOnly={phoneLocked}
            aria-readonly={phoneLocked}
            required
          />
          <p className={styles["help"]}>
            {phoneLocked
              ? "Locked to the JazzCash number from your landing checkout. It unlocks after you sign in successfully."
              : "Pakistan mobile formats such as 0300 1234567 and +923001234567 are accepted."}
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
            autoComplete={isSignUp ? "new-password" : "current-password"}
            maxLength={128}
            placeholder={isSignUp ? "Create a password" : "Enter password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <p className={styles["help"]}>
            At least 7 characters with upper, lower, number and symbol (example: Abc@123).
          </p>
        </div>
        {isSignUp ? (
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
        ) : null}
        <button
          className={styles["action"]}
          type="submit"
          disabled={
            !hydrated ||
            busy ||
            fullName.trim().length < 2 ||
            phone.trim().length < 10 ||
            password.length < 7 ||
            (isSignUp && confirmPassword.length < 7)
          }
        >
          {busy ? (isSignUp ? "Signing up…" : "Signing in…") : isSignUp ? "Sign up" : "Sign in"}
        </button>
      </form>

      <div aria-live="polite" aria-atomic="true">
        {message ? (
          <p className={`${styles["message"]} ${isError ? styles["error"] : styles["success"]}`}>
            {message}
          </p>
        ) : null}
      </div>

      {isSignUp ? (
        <p className={styles["privacy"]}>
          Already have an account?{" "}
          <Link href={withReturnTo("/en/sign-in", returnTo) as Route}>Click here to Sign in</Link>.
        </p>
      ) : (
        <p className={styles["privacy"]}>
          Existing learners who previously used OTP can sign in with password Abc@123, then change
          it later from support if needed.
        </p>
      )}
    </div>
  );
}
