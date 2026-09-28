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
  checkoutMode?: "jazzcash_wallet_link" | "jazzcash_v11" | null;
}>;

type BillingError = Readonly<{
  error?: string;
  message?: string;
}>;

type LinkStartResponse = Readonly<{
  actionUrl?: string;
  fields?: Readonly<Record<string, string>>;
  checkoutMode?: string;
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

function newIdempotencyKey(planCode: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${planCode}-${crypto.randomUUID()}`;
  }
  return `${planCode}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function postHostedForm(actionUrl: string, fields: Readonly<Record<string, string>>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export function PremiumOffer({ plans }: Readonly<{ plans: readonly Plan[] }>) {
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [msisdn, setMsisdn] = useState("");
  const [consent, setConsent] = useState(false);
  const usesWalletLink = plans.some(
    (plan) => plan.checkoutMode === "jazzcash_wallet_link" || plan.checkoutMode === "jazzcash_v11",
  );

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
      setMessage("Confirm payment authorization before continuing.");
      return;
    }

    setBusyPlan(planCode);
    setMessage(null);

    try {
      if (usesWalletLink) {
        const response = await fetch("/api/v1/premium/billing/jazzcash-v11/link/start", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            planCode,
            msisdn,
            consentToAutoPay: true,
            idempotencyKey: newIdempotencyKey(planCode),
          }),
        });
        if (response.status === 401) {
          window.location.assign("/en/sign-in?returnTo=%2Fen%2Fpricing");
          return;
        }
        if (!response.ok) {
          const error = await errorBody(response);
          setMessage(error.message ?? "JazzCash wallet linking could not be started.");
          return;
        }
        const link = (await response.json()) as LinkStartResponse;
        if (!link.actionUrl || !link.fields) {
          setMessage("JazzCash wallet-link form was incomplete. Please try again.");
          return;
        }
        postHostedForm(link.actionUrl, link.fields);
        return;
      }

      const response = await fetch("/api/v1/commercial/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planCode,
          idempotencyKey: newIdempotencyKey(planCode),
          msisdn,
        }),
      });
      if (response.status === 401) {
        window.location.assign("/en/sign-in?returnTo=%2Fen%2Fpricing");
        return;
      }
      if (!response.ok) {
        const error = await errorBody(response);
        setMessage(error.message ?? "JazzCash payment could not be started. Please try again.");
        return;
      }
      setMessage("Checkout started. Complete payment and return to your account.");
    } catch {
      setMessage("Payment could not be started. Check your connection and try again.");
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
                  onChange={(event) =>
                    setMsisdn(event.target.value.replace(/\D/g, "").slice(0, 15))
                  }
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
                    I authorize SkillUp to link this JazzCash wallet and charge the selected Premium
                    plan.
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
                ? "Opening JazzCash…"
                : plan.checkoutAvailable
                  ? usesWalletLink
                    ? "Link JazzCash & Pay"
                    : "Pay with JazzCash"
                  : "Payment activation pending"}
            </button>
            <p className={styles["note"]}>
              {usesWalletLink
                ? "You will enter your JazzCash MPIN on the JazzCash portal. SkillUp stores only the payment token and charges server-side after a verified link."
                : "SkillUp charges through JazzCash and grants Premium only after a verified server-side response—not from the browser alone."}
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
