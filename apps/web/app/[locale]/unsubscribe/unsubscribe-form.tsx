"use client";

import Link from "next/link";
import { type ReactElement, useId, useState } from "react";

import { isValidJazzCashMsisdn } from "../../../lib/jazzcash-checkout";
import { clearPremiumUnlockedFlag } from "../../../lib/premium-unlock";
import styles from "../account-flow.module.css";

type LookupSuccess = Readonly<{
  subscribed: true;
  planCode: string | null;
  message?: string;
}>;

type ApiErrorBody = Readonly<{
  error?: string;
  message?: string;
  subscribed?: boolean;
}>;

type Step = "enter" | "confirm";

function planLabel(planCode: string | null): string {
  if (planCode === "premium-yearly") return "Premium Yearly";
  if (planCode === "premium-monthly") return "Premium Monthly";
  return "Premium";
}

export function UnsubscribeForm(): ReactElement {
  const msisdnId = useId();
  const [msisdn, setMsisdn] = useState("");
  const [step, setStep] = useState<Step>("enter");
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactElement | string | null>(null);

  function noSubscriptionError(): ReactElement {
    return (
      <>
        You don&apos;t have any active subscription.{" "}
        <Link href="/en/pricing">Click Here to view plans</Link>
      </>
    );
  }

  async function lookupSubscription(): Promise<void> {
    const normalized = msisdn.replace(/\D/g, "");
    if (!isValidJazzCashMsisdn(normalized)) {
      setError("Enter a valid JazzCash mobile number (11–15 digits).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/commercial/premium/unsubscribe/lookup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ msisdn: normalized }),
      });
      const body = (await response.json().catch(() => ({}))) as LookupSuccess | ApiErrorBody;

      if (response.status === 404 || body.subscribed === false) {
        setStep("enter");
        setPlanCode(null);
        setError(noSubscriptionError());
        return;
      }

      if (!response.ok) {
        setError(
          ("message" in body && body.message) ||
            "We could not check this JazzCash number. Try again.",
        );
        return;
      }

      setMsisdn(normalized);
      setPlanCode("planCode" in body ? body.planCode : null);
      setStep("confirm");
    } catch {
      setError("We could not check this JazzCash number. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmUnsubscribe(): Promise<void> {
    const normalized = msisdn.replace(/\D/g, "");
    if (!isValidJazzCashMsisdn(normalized)) {
      setError("Enter a valid JazzCash mobile number (11–15 digits).");
      setStep("enter");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/commercial/premium/unsubscribe/confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ msisdn: normalized, confirm: true }),
      });
      const body = (await response.json().catch(() => ({}))) as Readonly<{
        cancelled?: boolean;
        message?: string;
      }>;

      if (response.status === 409 || body.cancelled === false) {
        setStep("enter");
        setPlanCode(null);
        setError(noSubscriptionError());
        return;
      }

      if (!response.ok || body.cancelled !== true) {
        setError(body.message ?? "Unsubscribe could not be completed. Try again.");
        return;
      }

      clearPremiumUnlockedFlag();
      window.location.assign("/en/pricing?unsubscribed=1");
    } catch {
      setError("Unsubscribe could not be completed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles["card"]} aria-labelledby="unsubscribe-card-title">
      <h2 id="unsubscribe-card-title">
        {step === "confirm" ? "Confirm cancellation" : "Unsubscribe from Premium"}
      </h2>
      <p className={styles["cardLead"]}>
        {step === "confirm"
          ? `Are you sure you want to cancel your ${planLabel(planCode)} subscription? Premium features will be locked immediately.`
          : "Enter the JazzCash mobile number used for SkillUp Premium. No sign-in is required."}
      </p>

      {error ? (
        <p className={`${styles["message"]} ${styles["error"]}`} role="alert">
          {error}
        </p>
      ) : null}

      {step === "enter" ? (
        <form
          className={styles["form"]}
          onSubmit={(event) => {
            event.preventDefault();
            void lookupSubscription();
          }}
        >
          <div className={styles["field"]}>
            <label className={styles["label"]} htmlFor={msisdnId}>
              JazzCash mobile number
            </label>
            <input
              className={styles["input"]}
              id={msisdnId}
              name="msisdn"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="03XXXXXXXXX"
              value={msisdn}
              onChange={(event) => {
                setMsisdn(event.target.value);
                setError(null);
              }}
              disabled={busy}
              required
            />
            <p className={styles["help"]}>Use the same number you used at JazzCash checkout.</p>
          </div>
          <button className={styles["action"]} type="submit" disabled={busy}>
            {busy ? "Checking…" : "Unsubscribe"}
          </button>
        </form>
      ) : (
        <div className={styles["form"]}>
          <p className={styles["help"]}>JazzCash number: {msisdn}</p>
          <button
            className={styles["action"]}
            type="button"
            disabled={busy}
            onClick={() => void confirmUnsubscribe()}
          >
            {busy ? "Cancelling…" : "Yes, cancel my subscription"}
          </button>
          <button
            className={styles["secondaryAction"]}
            type="button"
            disabled={busy}
            onClick={() => {
              setStep("enter");
              setError(null);
            }}
          >
            Keep my subscription
          </button>
        </div>
      )}
    </section>
  );
}
