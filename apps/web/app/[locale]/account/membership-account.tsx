"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { withReturnTo } from "../../../lib/return-to";
import styles from "./account.module.css";

type Entitlement = Readonly<{
  id: string;
  planCode: string;
  status: "active" | "grace" | "expired" | "cancelled" | "refunded" | "revoked";
  startsAt: string;
  endsAt: string;
  graceEndsAt: string | null;
  capabilities: readonly string[];
}>;

type PaymentOrder = Readonly<{
  id: string;
  planCode: string;
  planName: string;
  status: "created" | "pending" | "succeeded" | "failed" | "cancelled" | "expired" | "refunded";
  amountMinor: number;
  currency: "PKR";
  merchantReference: string;
  providerReference: string | null;
  checkoutExpiresAt: string;
  createdAt: string;
}>;

type AccountResponse = Readonly<{
  entitlement?: Entitlement | null;
  orders?: readonly PaymentOrder[];
  message?: string;
}>;

const capabilityLabels: Readonly<Record<string, string>> = {
  expanded_levels: "Expanded learning levels",
  detailed_progress: "Detailed progress insights",
  advanced_ai_challenges: "Advanced reviewed AI-assisted challenges",
  premium_avatars: "Premium profile avatars",
};

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

function money(amountMinor: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function queryMessage(): string | null {
  const parameters = new URLSearchParams(window.location.search);
  const payment = parameters.get("payment");
  if (payment === "succeeded") return "Payment verified. Premium access is active.";
  if (payment === "pending") return "Payment is still pending. Refresh this page after a moment.";
  if (payment === "failed") return "Payment was not completed. No premium access was granted.";
  if (payment === "cancelled") return "Checkout was cancelled. No payment was recorded.";
  if (payment === "expired")
    return "The checkout session expired. Start a new checkout when ready.";
  if (payment === "refunded") return "The payment was refunded and premium access was updated.";
  if (payment === "error")
    return "The provider response could not be verified. Support can review the reference.";
  return null;
}

export function MembershipAccount() {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountResponse>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async (signal: AbortSignal | null = null) => {
    setError(null);
    try {
      const response = await fetch("/api/v1/commercial/account", {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (response.status === 401) {
        window.location.replace(withReturnTo("/en/sign-in", "/en/account"));
        return;
      }
      if (!response.ok) {
        setError("Your membership information is temporarily unavailable.");
        return;
      }
      setAccount((await response.json()) as AccountResponse);
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
        setError("Your membership information is temporarily unavailable.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setMessage(queryMessage());
    void loadAccount(controller.signal);
    return () => controller.abort();
  }, [loadAccount]);

  if (loading) {
    return <section className={styles["panel"]}>Loading your private membership…</section>;
  }

  const entitlement = account.entitlement ?? null;
  const orders = account.orders ?? [];

  return (
    <>
      {message ? <p className={styles["message"]}>{message}</p> : null}
      {error ? (
        <p className={`${styles["message"]} ${styles["error"]}`} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles["panel"]} aria-labelledby="membership-status-title">
        <h2 id="membership-status-title">Membership status</h2>
        <div className={`${styles["status"]} ${!entitlement ? styles["statusInactive"] : ""}`}>
          <div>
            <strong>{entitlement ? entitlement.planCode.replaceAll("-", " ") : "Free plan"}</strong>
            <span>
              {entitlement
                ? `${entitlement.status} through ${dateLabel(
                    entitlement.graceEndsAt ?? entitlement.endsAt,
                  )}`
                : "Useful reviewed learning remains available without payment."}
            </span>
          </div>
        </div>

        {entitlement ? (
          <ul className={styles["capabilities"]}>
            {entitlement.capabilities.map((capability) => (
              <li key={capability}>{capabilityLabels[capability] ?? capability}</li>
            ))}
          </ul>
        ) : null}

        <div className={styles["actions"]}>
          <Link className={styles["button"]} href="/en/pricing">
            {entitlement ? "Compare plans" : "View premium plans"}
          </Link>
          <Link className={`${styles["button"]} ${styles["secondary"]}`} href="/en/progress">
            View learning progress
          </Link>
          <button
            className={`${styles["button"]} ${styles["secondary"]}`}
            type="button"
            onClick={() => void loadAccount()}
          >
            Refresh status
          </button>
        </div>
      </section>

      <section className={styles["panel"]} aria-labelledby="payment-history-title">
        <h2 id="payment-history-title">Payment history</h2>
        {orders.length === 0 ? (
          <p>No payment order has been created for this account.</p>
        ) : (
          <table className={styles["orders"]}>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Created</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.planName}</td>
                  <td>{order.status}</td>
                  <td>{money(order.amountMinor)}</td>
                  <td>{dateLabel(order.createdAt)}</td>
                  <td className={styles["reference"]}>
                    {order.providerReference ?? order.merchantReference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
