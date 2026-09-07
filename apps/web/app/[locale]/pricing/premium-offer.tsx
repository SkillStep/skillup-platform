"use client";

import { useEffect, useState } from "react";

import styles from "./pricing.module.css";

type Plan = Readonly<{
  code: "premium-monthly" | "premium-yearly";
  name: string;
  amountMinor: number;
  currency: "PKR";
  billingPeriod: "month" | "year";
  capabilities: readonly string[];
  checkoutAvailable: boolean;
}>;

type BillingError = Readonly<{
  error?: string;
  message?: string;
}>;

type WalletLinkResponse = Readonly<{
  requestId?: string;
  portalUrl?: string;
  method?: "POST";
  fields?: Readonly<Record<string, string>>;
}>;

type BillingStatus = Readonly<{
  wallet?: Readonly<{ status?: string }>;
  alreadySubscribed?: boolean;
}>;

const capabilityLabels: Readonly<Record<string, string>> = {
  expanded_levels: "Expanded learning levels",
  detailed_progress: "Detailed progress insights",
  advanced_ai_challenges: "Advanced reviewed AI-assisted challenges",
  premium_avatars: "Premium profile avatars",
};

function formatPrice(amountMinor: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

async function errorBody(response: Response): Promise<BillingError> {
  try {
    return (await response.json()) as BillingError;
  } catch {
    return {};
  }
}

function submitHostedForm(portalUrl: string, fields: Readonly<Record<string, string>>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = portalUrl;
  form.hidden = true;

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }

  document.body.append(form);
  form.submit();
}

async function recoverAlreadyLinked(planCode: Plan["code"]): Promise<boolean> {
  const statusResponse = await fetch("/api/v1/billing/status", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!statusResponse.ok) return false;
  const status = (await statusResponse.json()) as BillingStatus;
  if (status.alreadySubscribed) {
    window.location.assign("/en/account?billing=already-subscribed");
    return true;
  }
  if (status.wallet?.status !== "linked") return false;

  const subscriptionResponse = await fetch("/api/v1/billing/subscriptions", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planCode, skipTrial: true }),
  });
  if (subscriptionResponse.ok || subscriptionResponse.status === 409) {
    window.location.assign("/en/account?billing=resubscribed");
    return true;
  }
  return false;
}

export function PremiumOffer({ plans }: Readonly<{ plans: readonly Plan[] }>) {
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [msisdn, setMsisdn] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/commercial/events/offer", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface: "public_pricing" }),
      signal: controller.signal,
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function startCheckout(planCode: Plan["code"]) {
    if (!/^\d{11,15}$/.test(msisdn)) {
      setMessage("Enter a valid JazzCash mobile number using 11–15 digits.");
      return;
    }
    if (!consent) {
      setMessage("Confirm the automatic-billing consent before linking your JazzCash wallet.");
      return;
    }

    setBusyPlan(planCode);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/billing/wallets/link", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planCode,
          msisdn,
          consentToAutoPay: true,
        }),
      });
      if (response.status === 401) {
        window.location.assign("/en/sign-in?returnTo=%2Fen%2Fpricing");
        return;
      }
      if (!response.ok) {
        const error = await errorBody(response);
        if (response.status === 409 && error.error === "already_linked") {
          if (await recoverAlreadyLinked(planCode)) return;
        }
        if (response.status === 409 && error.error === "already_subscribed") {
          window.location.assign("/en/account?billing=already-subscribed");
          return;
        }
        setMessage(error.message ?? "JazzCash wallet linking could not be started. Please try again.");
        return;
      }

      const link = (await response.json()) as WalletLinkResponse;
      if (!link.portalUrl || !link.fields || link.method !== "POST") {
        setMessage("Wallet-link configuration is incomplete. No payment was attempted.");
        return;
      }
      submitHostedForm(link.portalUrl, link.fields);
    } catch {
      setMessage("Wallet linking could not be started. Check your connection and try again.");
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <div className={styles["grid"]}>
      {plans.map((plan) => {
        const yearly = plan.billingPeriod === "year";
        const msisdnId = `jazzcash-msisdn-${plan.code}`;
        const consentId = `jazzcash-consent-${plan.code}`;
        return (
          <article
            className={`${styles["card"]} ${yearly ? styles["featured"] : ""}`}
            key={plan.code}
          >
            <span className={styles["badge"]}>{yearly ? "Best value" : "Flexible"}</span>
            <h2>{plan.name}</h2>
            <p className={styles["price"]}>
              <strong>{formatPrice(plan.amountMinor)}</strong>
              <span>/{plan.billingPeriod}</span>
            </p>
            {yearly ? <p className={styles["saving"]}>Save PKR 2,189 versus monthly.</p> : null}
            <ul className={styles["features"]}>
              {plan.capabilities.map((capability) => (
                <li key={capability}>{capabilityLabels[capability] ?? capability}</li>
              ))}
            </ul>

            {plan.checkoutAvailable ? (
              <div className={styles["walletForm"]}>
                <label htmlFor={msisdnId}>JazzCash mobile number</label>
                <input
                  id={msisdnId}
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="03001234567"
                  value={msisdn}
                  onChange={(event) => setMsisdn(event.target.value.replace(/\D/g, "").slice(0, 15))}
                  disabled={busyPlan !== null}
                />
                <label className={styles["consent"]} htmlFor={consentId}>
                  <input
                    id={consentId}
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    disabled={busyPlan !== null}
                  />
                  <span>
                    I authorize automatic JazzCash billing for this plan until I cancel the
                    subscription or unlink my wallet.
                  </span>
                </label>
              </div>
            ) : null}

            <button
              className={styles["action"]}
              type="button"
              disabled={!plan.checkoutAvailable || busyPlan !== null}
              onClick={() => void startCheckout(plan.code)}
            >
              {busyPlan === plan.code
                ? "Opening secure JazzCash…"
                : plan.checkoutAvailable
                  ? "Link JazzCash & continue"
                  : "Payment activation pending"}
            </button>
            <p className={styles["note"]}>
              Your MPIN is entered only on JazzCash&apos;s hosted page. SkillUp grants Premium only
              from authoritative payment-service status—not from the browser return page.
            </p>
            {message && busyPlan === null ? (
              <p className={styles["message"]} role="alert">
                {message}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
