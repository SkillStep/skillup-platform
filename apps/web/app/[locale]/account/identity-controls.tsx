"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { withReturnTo } from "../../../lib/return-to";
import styles from "./account.module.css";

type IdentityValue = Readonly<{ value: string; verifiedAt: string }>;
type Identities = Readonly<{ email: IdentityValue | null; phone: IdentityValue | null }>;
type Challenge = Readonly<{
  challengeId: string;
  channel: "email" | "sms";
  maskedDestination: string;
  expiresAt: string;
}>;

async function request(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers,
  });
  if (response.status === 401) {
    window.location.replace(withReturnTo("/en/sign-in", "/en/account"));
  }
  return response;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // Ignore non-JSON errors.
  }
  return "That action could not be completed.";
}

export function IdentityControls() {
  const [identities, setIdentities] = useState<Identities | null>(null);
  const [identity, setIdentity] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await request("/account/identities");
    if (!response.ok) throw new Error(await errorMessage(response));
    setIdentities((await response.json()) as Identities);
  }, []);

  useEffect(() => {
    void load().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Sign-in methods could not be loaded."),
    );
  }, [load]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await request("/account/identities/otp/start", {
        method: "POST",
        body: JSON.stringify({ identity }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const body = (await response.json()) as Challenge;
      setChallenge(body);
      setMessage(`Enter the code sent to ${body.maskedDestination}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Verification could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const response = await request("/account/identities/otp/verify", {
        method: "POST",
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          channel: challenge.channel,
          code,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setIdentities((await response.json()) as Identities);
      setChallenge(null);
      setIdentity("");
      setCode("");
      setMessage("Verified sign-in method saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(channel: "email" | "sms") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await request(`/account/identities/${channel}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await errorMessage(response));
      setIdentities((await response.json()) as Identities);
      setMessage("Sign-in method removed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in method could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles["panel"]} aria-labelledby="sign-in-methods-title">
      <h2 id="sign-in-methods-title">Sign-in methods</h2>
      <p>
        You can use either a verified email address or Pakistani mobile number. Keep at least one
        verified method on your account.
      </p>

      <div className={styles["identityList"]}>
        <div>
          <strong>Email</strong>
          <span>{identities?.email?.value ?? "Not linked"}</span>
          {identities?.email && identities.phone ? (
            <button
              className={styles["textButton"]}
              type="button"
              disabled={busy}
              onClick={() => void remove("email")}
            >
              Remove email
            </button>
          ) : null}
        </div>
        <div>
          <strong>Mobile</strong>
          <span>{identities?.phone?.value ?? "Not linked"}</span>
          {identities?.phone && identities.email ? (
            <button
              className={styles["textButton"]}
              type="button"
              disabled={busy}
              onClick={() => void remove("sms")}
            >
              Remove mobile
            </button>
          ) : null}
        </div>
      </div>

      {challenge ? (
        <form className={styles["identityForm"]} onSubmit={verify}>
          <label>
            Verification code
            <input
              value={code}
              onChange={(event) =>
                setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 4))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{4}"
              maxLength={4}
              required
            />
          </label>
          <div className={styles["actions"]}>
            <button className={styles["button"]} disabled={busy || code.length !== 4} type="submit">
              {busy ? "Verifying…" : "Verify and save"}
            </button>
            <button
              className={`${styles["button"]} ${styles["secondary"]}`}
              disabled={busy}
              type="button"
              onClick={() => {
                setChallenge(null);
                setCode("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <form className={styles["identityForm"]} onSubmit={start}>
          <label>
            Add or replace email/mobile
            <input
              value={identity}
              onChange={(event) => setIdentity(event.currentTarget.value)}
              placeholder="name@example.com or 0300 1234567"
              autoComplete="username"
              required
            />
          </label>
          <button
            className={styles["button"]}
            disabled={busy || identity.trim().length < 3}
            type="submit"
          >
            {busy ? "Sending…" : "Send verification code"}
          </button>
        </form>
      )}

      <div aria-live="polite">
        {message ? <p className={styles["message"]}>{message}</p> : null}
        {error ? (
          <p className={`${styles["message"]} ${styles["error"]}`} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
