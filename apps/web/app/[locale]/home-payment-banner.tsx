"use client";

import { useEffect, useState } from "react";

type PaymentBannerProps = Readonly<{
  payment?: string | null;
  orderId?: string | null;
}>;

function paymentCopy(payment: string | null | undefined): Readonly<{
  tone: "success" | "pending" | "error";
  title: string;
  body: string;
}> | null {
  if (!payment) return null;
  if (payment === "succeeded") {
    return {
      tone: "success",
      title: "Payment successful",
      body: "Your Premium subscription is active. You can keep learning with full Premium access.",
    };
  }
  if (payment === "pending") {
    return {
      tone: "pending",
      title: "Payment pending",
      body: "Your JazzCash payment is still being confirmed. Premium unlocks once verification finishes.",
    };
  }
  if (payment === "failed" || payment === "error") {
    return {
      tone: "error",
      title: "Payment not completed",
      body: "No Premium access was granted. You can try again from Premium pricing.",
    };
  }
  if (payment === "cancelled") {
    return {
      tone: "error",
      title: "Checkout cancelled",
      body: "No payment was recorded. Return to Premium pricing when you are ready.",
    };
  }
  if (payment === "expired") {
    return {
      tone: "error",
      title: "Checkout expired",
      body: "Start a new checkout from Premium pricing when you are ready.",
    };
  }
  if (payment === "refunded") {
    return {
      tone: "pending",
      title: "Payment refunded",
      body: "The payment was refunded and Premium access was updated.",
    };
  }
  return null;
}

export function HomePaymentBanner({ payment, orderId }: PaymentBannerProps) {
  const copy = paymentCopy(payment);
  const [visible, setVisible] = useState(Boolean(copy));

  useEffect(() => {
    if (!copy) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    url.searchParams.delete("orderId");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [copy]);

  if (!copy || !visible) return null;

  return (
    <div className={`home-payment-banner home-payment-banner-${copy.tone}`} role="status">
      <div>
        <p className="home-payment-banner-title">{copy.title}</p>
        <p className="home-payment-banner-body">{copy.body}</p>
        {orderId && copy.tone === "success" ? (
          <p className="home-payment-banner-ref">Reference: {orderId}</p>
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
