"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { trackPaymentConversion } from "../../lib/landing-analytics";
import { markPremiumUnlocked } from "../../lib/premium-unlock";
import { withReturnTo } from "../../lib/return-to";

type PaymentBannerProps = Readonly<{
  payment?: string | null;
  orderId?: string | null;
}>;

function paymentCopy(payment: string | null | undefined): Readonly<{
  tone: "success" | "pending" | "error";
  title: string;
  body: string;
  showPricingLink: boolean;
  showAuthPrompt: boolean;
}> | null {
  if (!payment) return null;
  if (payment === "succeeded") {
    return {
      tone: "success",
      title: "Premium Features Unlocked",
      body: "Your JazzCash subscription is active. Create an account or sign in with your JazzCash number to use Premium.",
      showPricingLink: false,
      showAuthPrompt: true,
    };
  }
  if (payment === "pending") {
    return {
      tone: "pending",
      title: "Payment pending",
      body: "Your JazzCash payment is still being confirmed. Premium unlocks once verification finishes.",
      showPricingLink: false,
      showAuthPrompt: false,
    };
  }
  if (payment === "wallet_not_found") {
    return {
      tone: "error",
      title: "JazzCash account required",
      body: "This mobile number is not linked to a JazzCash wallet. Open the JazzCash app, create an account with the same number, then return here to subscribe.",
      showPricingLink: true,
      showAuthPrompt: false,
    };
  }
  if (payment === "failed" || payment === "error") {
    return {
      tone: "error",
      title: "Payment not completed",
      body: "No Premium access was granted. You can try again from Premium pricing.",
      showPricingLink: true,
      showAuthPrompt: false,
    };
  }
  if (payment === "cancelled") {
    return {
      tone: "error",
      title: "Checkout cancelled",
      body: "No payment was recorded. Return to Premium pricing when you are ready.",
      showPricingLink: true,
      showAuthPrompt: false,
    };
  }
  if (payment === "expired") {
    return {
      tone: "error",
      title: "Checkout expired",
      body: "Start a new checkout from Premium pricing when you are ready.",
      showPricingLink: true,
      showAuthPrompt: false,
    };
  }
  if (payment === "refunded") {
    return {
      tone: "pending",
      title: "Payment refunded",
      body: "The payment was refunded and Premium access was updated.",
      showPricingLink: false,
      showAuthPrompt: false,
    };
  }
  return null;
}

export function HomePaymentBanner({ payment, orderId }: PaymentBannerProps) {
  const copy = paymentCopy(payment);
  const titleId = useId();
  const [visible, setVisible] = useState(Boolean(copy));
  const [guestAuthPrompt, setGuestAuthPrompt] = useState(false);

  useEffect(() => {
    if (!copy || !payment) return;
    if (copy.tone === "success") markPremiumUnlocked();
    if (orderId) {
      trackPaymentConversion({
        paymentStatus: payment,
        transactionId: orderId,
      });
    }

    let cancelled = false;
    void (async () => {
      if (!copy.showAuthPrompt) {
        setGuestAuthPrompt(false);
        return;
      }
      try {
        const response = await fetch("/api/v1/commercial/account", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (cancelled) return;
        // Guests need Sign up / Sign in after JazzCash; signed-in learners only see status.
        setGuestAuthPrompt(response.status === 401);
      } catch {
        if (!cancelled) setGuestAuthPrompt(true);
      }
    })();

    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    url.searchParams.delete("orderId");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);

    return () => {
      cancelled = true;
    };
  }, [copy, orderId, payment]);

  if (!copy || !visible) return null;

  const showModal = copy.showAuthPrompt && guestAuthPrompt;
  const signUpHref = withReturnTo("/en/sign-up", "/en") as Route;
  const signInHref = withReturnTo("/en/sign-in", "/en") as Route;

  if (showModal) {
    return (
      <div className="home-payment-modal-root" role="presentation">
        <button
          type="button"
          className="home-payment-modal-backdrop"
          aria-label="Dismiss sign-in prompt"
          onClick={() => setVisible(false)}
        />
        <div
          className="home-payment-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <p className="home-payment-banner-title" id={titleId}>
            {copy.title}
          </p>
          <p className="home-payment-banner-body">{copy.body}</p>
          {orderId ? <p className="home-payment-banner-ref">Reference: {orderId}</p> : null}
          <div className="home-payment-modal-actions">
            <Link className="button button-primary" href={signUpHref}>
              Sign up
            </Link>
            <Link className="button button-secondary" href={signInHref}>
              Sign in
            </Link>
          </div>
          <button
            className="home-payment-banner-dismiss"
            type="button"
            onClick={() => setVisible(false)}
          >
            Maybe later
          </button>
        </div>
      </div>
    );
  }

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
