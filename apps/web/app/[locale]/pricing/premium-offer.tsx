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

type CheckoutResponse = Readonly<{
  order?: Readonly<{ id: string }>;
  method?: "POST";
  action?: string;
  fields?: Readonly<Record<string, string>>;
  message?: string;
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

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as CheckoutResponse;
    if (body.message) return body.message;
  } catch {
    // A provider or proxy error may not be JSON.
  }
  return "Checkout could not be started. Please try again.";
}

function submitProviderForm(action: string, fields: Readonly<Record<string, string>>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
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

export function PremiumOffer({ plans }: Readonly<{ plans: readonly Plan[] }>) {
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    setBusyPlan(planCode);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/commercial/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planCode,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (response.status === 401) {
        window.location.assign("/en/sign-in?returnTo=%2Fen%2Fpricing");
        return;
      }
      if (!response.ok) {
        setMessage(await responseMessage(response));
        return;
      }

      const checkout = (await response.json()) as CheckoutResponse;
      if (!checkout.action || !checkout.fields || checkout.method !== "POST") {
        setMessage("Checkout configuration is incomplete. No payment was attempted.");
        return;
      }
      submitProviderForm(checkout.action, checkout.fields);
    } catch {
      setMessage("Checkout could not be started. Check your connection and try again.");
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <div className={styles["grid"]}>
      {plans.map((plan) => {
        const yearly = plan.billingPeriod === "year";
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
            <button
              className={styles["action"]}
              type="button"
              disabled={!plan.checkoutAvailable || busyPlan !== null}
              onClick={() => void startCheckout(plan.code)}
            >
              {busyPlan === plan.code
                ? "Preparing secure checkout…"
                : plan.checkoutAvailable
                  ? "Continue with JazzCash"
                  : "Merchant activation pending"}
            </button>
            <p className={styles["note"]}>
              Premium activates only after SkillUp verifies the provider response.
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
