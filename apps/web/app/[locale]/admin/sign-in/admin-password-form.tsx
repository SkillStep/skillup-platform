"use client";

import { type FormEvent, useId, useState } from "react";

import styles from "../../account-flow.module.css";

type Props = Readonly<{
  returnTo: string;
}>;

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Readonly<{ message?: string }>;
    if (typeof body.message === "string" && body.message.trim()) return body.message;
  } catch {
    // Ignore JSON parse failures.
  }
  return "Admin sign-in failed. Check your email and password.";
}

export function AdminPasswordForm({ returnTo }: Props) {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("staging.admin@skillup.test");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setIsError(false);
    try {
      const response = await fetch("/api/v1/auth/admin/password/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        setIsError(true);
        setMessage(await readError(response));
        return;
      }
      setMessage("Signed in. Opening the operations console…");
      window.location.assign(returnTo);
    } catch {
      setIsError(true);
      setMessage("Admin sign-in is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles["card"]}>
      <h2>Admin sign in</h2>
      <p className={styles["cardLead"]}>
        Operator access uses email and password. After success you return to the admin panel.
      </p>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor={emailId}>
          <span>Email</span>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </label>
        <label htmlFor={passwordId}>
          <span>Password</span>
          <input
            id={passwordId}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {message ? (
        <p className={styles["message"]} role={isError ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
