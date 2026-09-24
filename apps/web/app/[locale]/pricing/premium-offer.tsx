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
  checkoutMode?: "jazzcash_v11" | null;
}>;

type BillingError = Readonly<{
  error?: string;
  message?: string;
}>;

type CheckoutResponse = Readonly<{
  order?: Readonly<{
    id?: string;
    status?: string;
  }>;
  providerResponseMessage?: string | null;
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

export function PremiumOffer({ plans }: Readonly<{ plans: readonly Plan[] }>) {
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [msisdn, setMsisdn] = useState("");
  const [mpin, setMpin] = useState("");
  const [cnic, setCnic] = useState("");
  const [consent, setConsent] = useState(false);
  const usesV11 = plans.some((plan) => plan.checkoutMode === "jazzcash_v11");

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
    if (usesV11 && !/^\d{4}$/.test(mpin)) {
      setMessage("Enter your 4-digit JazzCash MPIN.");
      return;
    }
    if (usesV11 && !/^\d{6}$/.test(cnic)) {
      setMessage("Enter the last 6 digits of your CNIC.");
      return;
    }
    if (!consent) {
      setMessage("Confirm payment authorization before continuing.");
      return;
    }

    setBusyPlan(planCode);
    setMessage(null);

    try {
      const response = await fetch(
        usesV11 ? "/api/v1/premium/billing/jazzcash-v11/charge" : "/api/v1/commercial/orders",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            usesV11
              ? {
                  planCode,
                  msisdn,
                  mpin,
                  cnic,
                  idempotencyKey: newIdempotencyKey(planCode),
                }
              : {
                  planCode,
                  idempotencyKey: newIdempotencyKey(planCode),
                  msisdn,
                },
          ),
        },
      );
      if (response.status === 401) {
        window.location.assign("/en/sign-in?returnTo=%2Fen%2Fpricing");
        return;
      }
      if (!response.ok) {
        const error = await errorBody(response);
        setMessage(error.message ?? "JazzCash payment could not be started. Please try again.");
        return;
      }

      const checkout = (await response.json()) as CheckoutResponse;
      const status = checkout.order?.status;
      const orderId = checkout.order?.id;
      if (status === "succeeded") {
        const url = new URL("/en/account", window.location.origin);
        url.searchParams.set("payment", "succeeded");
        if (orderId) url.searchParams.set("orderId", orderId);
        window.location.assign(url.toString());
        return;
      }
      if (status === "pending") {
        setMessage(
          checkout.providerResponseMessage ??
            "Payment is pending with JazzCash. Check your account shortly.",
        );
        return;
      }
      setMessage(
        checkout.providerResponseMessage ??
          "JazzCash did not complete this payment. No Premium entitlement was granted.",
      );
    } catch {
      setMessage("Payment could not be started. Check your connection and try again.");
    } finally {
      setBusyPlan(null);
      setMpin("");
    }
  }

  return (
    <div className={styles["grid"]}>
      {plans.map((plan) => {
        const yearly = plan.billingPeriod === "year";
        const msisdnId = `jazzcash-msisdn-${plan.code}`;
        const mpinId = `jazzcash-mpin-${plan.code}`;
        const cnicId = `jazzcash-cnic-${plan.code}`;
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
                {usesV11 ? (
                  <>
                    <label htmlFor={mpinId}>JazzCash MPIN</label>
                    <input
                      id={mpinId}
                      type="password"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="••••"
                      value={mpin}
                      onChange={(event) =>
                        setMpin(event.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      disabled={busyPlan !== null}
                    />
                    <label htmlFor={cnicId}>CNIC last 6 digits</label>
                    <input
                      id={cnicId}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="345678"
                      value={cnic}
                      onChange={(event) =>
                        setCnic(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      disabled={busyPlan !== null}
                    />
                  </>
                ) : null}
                <label className={styles["consent"]} htmlFor={consentId}>
                  <input
                    id={consentId}
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    disabled={busyPlan !== null}
                  />
                  <span>
                    I authorize SkillUp to charge this JazzCash mobile wallet for the selected
                    Premium plan.
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
                ? "Charging JazzCash…"
                : plan.checkoutAvailable
                  ? "Pay with JazzCash"
                  : "Payment activation pending"}
            </button>
            <p className={styles["note"]}>
              {usesV11
                ? "SkillUp charges JazzCash server-side and grants Premium only after a verified response. Your MPIN is never sent to the browser’s JazzCash page."
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
