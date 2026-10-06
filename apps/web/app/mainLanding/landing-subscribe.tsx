"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, type ReactElement, useEffect, useState } from "react";

import {
  isValidJazzCashMsisdn,
  type JazzCashLinkStartResponse,
  LANDING_MSISDN_STORAGE_KEY,
  newCheckoutIdempotencyKey,
  postHostedJazzCashForm,
  readBillingError,
} from "../../lib/jazzcash-checkout";
import {
  buildLandingPath,
  type LandingCampaign,
  planCodeForPackage,
} from "../../lib/landing-campaign";
import styles from "./landing.module.css";
import { Icon } from "./landing-icons";

type CheckoutMode = "jazzcash_wallet_link" | "jazzcash_v11" | "premium_bypass" | null;

export function LandingSubscribeCard({
  campaign,
  checkoutMode,
}: Readonly<{
  campaign: LandingCampaign;
  checkoutMode: CheckoutMode;
}>): ReactElement {
  const [msisdn, setMsisdn] = useState("");
  const [agree, setAgree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const planCode = planCodeForPackage(campaign.package);
  const landingPath = buildLandingPath(campaign);
  const bypass = checkoutMode === "premium_bypass";

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(LANDING_MSISDN_STORAGE_KEY);
      if (saved && isValidJazzCashMsisdn(saved)) setMsisdn(saved);
    } catch {
      // Ignore storage access failures.
    }
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);

    const normalized = msisdn.replace(/\D/g, "");
    if (!bypass && !isValidJazzCashMsisdn(normalized)) {
      setMessage("Enter a valid JazzCash mobile number like 03XXXXXXXXX.");
      return;
    }
    if (!agree) {
      setMessage("Confirm the Terms and Conditions before continuing.");
      return;
    }

    setBusy(true);
    let handedOffToProvider = false;

    try {
      if (!bypass) {
        try {
          sessionStorage.setItem(LANDING_MSISDN_STORAGE_KEY, normalized);
        } catch {
          // Ignore storage access failures.
        }
      }

      if (bypass) {
        const response = await fetch("/api/v1/commercial/premium-bypass/activate", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planCode }),
        });
        if (response.status === 401) {
          window.location.assign(`/en/sign-in?returnTo=${encodeURIComponent(landingPath)}`);
          return;
        }
        if (!response.ok) {
          const error = await readBillingError(response);
          setMessage(error.message ?? "Premium could not be activated for testing.");
          return;
        }
        window.location.assign("/en?payment=succeeded");
        return;
      }

      const response = await fetch("/api/v1/premium/billing/jazzcash-v11/link/start", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planCode,
          msisdn: normalized,
          consentToAutoPay: true,
          idempotencyKey: newCheckoutIdempotencyKey(planCode),
        }),
      });
      if (response.status === 401) {
        window.location.assign(`/en/sign-in?returnTo=${encodeURIComponent(landingPath)}`);
        return;
      }
      if (!response.ok) {
        const error = await readBillingError(response);
        setMessage(error.message ?? "JazzCash wallet linking could not be started.");
        return;
      }
      const link = (await response.json()) as JazzCashLinkStartResponse;
      if (!link.actionUrl || !link.fields) {
        setMessage("JazzCash payment form was incomplete. Please try again.");
        return;
      }
      postHostedJazzCashForm(link.actionUrl, link.fields);
      handedOffToProvider = true;
    } catch {
      setMessage("Payment could not be started. Check your connection and try again.");
    } finally {
      if (!handedOffToProvider) setBusy(false);
    }
  }

  return (
    <section className={styles["paymentCard"]} aria-labelledby="payment-heading">
      <h2 id="payment-heading" className={styles["paymentTitle"]}>
        <span className={styles["phoneIcon"]}>
          <Icon name="phone" />
        </span>
        Enter Your JazzCash Number
      </h2>

      <form className={styles["paymentForm"]} onSubmit={(event) => void onSubmit(event)}>
        <label className={styles["inputWrap"]} htmlFor="jazzcash-number">
          <span className={styles["jazzcashLogo"]}>
            <Image
              src="/landing/jazzcash-logo.png"
              alt="JazzCash"
              width={320}
              height={320}
              className={styles["jazzcashLogoImg"]}
            />
          </span>
          <span className={styles["inputDivider"]} aria-hidden="true" />
          <input
            id="jazzcash-number"
            name="msisdn"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="03XX XXXXXXX"
            className={styles["phoneInput"]}
            aria-label="JazzCash mobile number"
            value={msisdn}
            onChange={(event) => setMsisdn(event.target.value.replace(/\D/g, "").slice(0, 15))}
            disabled={busy}
            required={!bypass}
          />
        </label>

        <label className={styles["terms"]}>
          <input
            type="checkbox"
            name="agree"
            checked={agree}
            onChange={(event) => setAgree(event.target.checked)}
            disabled={busy}
            required
          />
          <span className={styles["check"]} aria-hidden="true">
            ✓
          </span>
          <span>
            I agree to Skillup <Link href="/en/legal/terms">Terms and Conditions</Link>
          </span>
        </label>

        <button type="submit" className={styles["pay"]} disabled={busy}>
          <span className={styles["payLock"]}>
            <Icon name="lock" />
          </span>
          {busy ? "Opening JazzCash…" : "Subscribe Now"}
          <span className={styles["payArrow"]}>
            <Icon name="arrow" />
          </span>
        </button>
      </form>

      {message ? (
        <p className={styles["notice"]} role="alert">
          {message}
        </p>
      ) : (
        <div className={styles["notice"]}>
          <div className={styles["noticeIcon"]} aria-hidden="true">
            <Icon name="megaphone" />
          </div>
          <p>
            Subscribe Now click kertay he Rs.1 kat lia jae ga. Ye limited offer sirf aj k din k liye
            valid hai. Us k bad PKR 599/m lago hun gay.
          </p>
          <span className={styles["noticeStripes"]} aria-hidden="true" />
        </div>
      )}
    </section>
  );
}
