"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { markPremiumUnlocked } from "../../lib/premium-unlock";

type PaymentBannerProps = Readonly<{
  payment?: string | null;
  orderId?: string | null;
}>;

function paymentCopy(payment: string | null | undefined): Readonly<{
  tone: "success" | "pending" | "error";
  title: string;
  body: string;
  showPricingLink: boolean;
}> | null {
  if (!payment) return null;
  if (payment === "succeeded") {
    return {
      tone: "success",
      title: "Premium Features Unlocked",
      body: "Your JazzCash subscription is active. Sign in with your JazzCash number when you are ready to use Premium.",
      showPricingLink: false,
    };
  }
  if (payment === "pending") {
    return {
      tone: "pending",
      title: "Payment pending",
      body: "Your JazzCash payment is still being confirmed. Premium unlocks once verification finishes.",
      showPricingLink: false,
    };
  }
  if (payment === "failed" || payment === "error") {
    return {
      tone: "error",
      title: "Payment not completed",
      body: "No Premium access was granted. You can try again from Premium pricing.",
      showPricingLink: true,
    };
  }
  if (payment === "cancelled") {
    return {
      tone: "error",
      title: "Checkout cancelled",
      body: "No payment was recorded. Return to Premium pricing when you are ready.",
      showPricingLink: true,
    };
  }
  if (payment === "expired") {
    return {
      tone: "error",
      title: "Checkout expired",
      body: "Start a new checkout from Premium pricing when you are ready.",
      showPricingLink: true,
    };
  }
  if (payment === "refunded") {
    return {
      tone: "pending",
      title: "Payment refunded",
      body: "The payment was refunded and Premium access was updated.",
      showPricingLink: false,
    };
  }
  return null;
}

export function HomePaymentBanner({ payment, orderId }: PaymentBannerProps) {
  const copy = paymentCopy(payment);
  const [visible, setVisible] = useState(Boolean(copy));

  useEffect(() => {
    if (!copy) return;
    if (copy.tone === "success") markPremiumUnlocked();
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    url.searchParams.delete("orderId");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [copy]);

  if (!copy || !visible) return null;

  return (
    <div
      className={`home-payment-banner home-payment-banner-${copy.tone}`}
      role="status"
      aria-live="polite"
    >
      <div>
        <p className="home-payment-banner-title">{copy.title}</p>
        <p className="home-payment-banner-body">{copy.body}</p>
        {orderId && copy.tone === "success" ? (
          <p className="home-payment-banner-ref">Reference: {orderId}</p>
        ) : null}
        {copy.showPricingLink ? (
          <p className="home-payment-banner-body">
            <Link href={"/en/pricing" as Route}>Premium pricing</Link>
          </p>
        ) : null}
      </div>
      <button
        className="home-payment-banner-dismiss"
        type="button"
        onClick={() => setVisible(false)}
      >
        Dismiss
      </button>
    </div>
  );
}
