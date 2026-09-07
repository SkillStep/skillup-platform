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
}>;

type BillingSubscription = Readonly<{
  id: string;
  plan_code: string;
  amount_minor: number;
  currency: "PKR";
  interval: "weekly" | "monthly" | "yearly";
  status:
    | "initiated"
    | "trialing"
    | "active"
    | "past_due"
    | "paused"
    | "payment_failed"
    | "expired"
    | "canceled";
  next_due_at?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
}>;

type BillingStatus = Readonly<{
  wallet: Readonly<{
    status: "none" | "pending" | "linked" | "unlinked" | "failed";
    msisdn_masked?: string | null;
  }>;
  alreadySubscribed: boolean;
  status: Readonly<{
    wallet_linked: boolean;
    subscription_status: BillingSubscription["status"] | null;
    current_period_paid: boolean;
    next_due_at?: string | null;
    last_payment_status?: "pending" | "completed" | "failed" | "expired" | "refunded" | null;
  }>;
  subscriptions: readonly BillingSubscription[];
}>;

type BillingPayment = Readonly<{
  id: string;
  amount_minor: number;
  charge_kind?: "full" | "step";
  currency: "PKR";
  status: "pending" | "completed" | "failed" | "expired" | "refunded";
  txn_ref_no?: string | null;
  response_message?: string | null;
  created_at: string;
}>;

const capabilityLabels: Readonly<Record<string, string>> = {
  expanded_levels: "Expanded learning levels",
  detailed_progress: "Detailed progress insights",
  advanced_ai_challenges: "Advanced reviewed AI-assisted challenges",
  premium_avatars: "Premium profile avatars",
};

const OPEN_SUBSCRIPTION_STATUSES: readonly BillingSubscription["status"][] = [
  "initiated",
  "trialing",
  "active",
  "past_due",
  "paused",
];

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
  const wallet = parameters.get("wallet");
  const billing = parameters.get("billing");
  if (wallet === "linked") {
    return "JazzCash wallet linked. Billing status is being verified before Premium access changes.";
  }
  if (wallet === "failed") {
    return "JazzCash wallet linking was not completed. No new billing access was granted.";
  }
  if (billing === "already-subscribed") return "This account already has an open Premium subscription.";
  if (billing === "resubscribed") {
    return "Subscription request accepted. Refreshing the authoritative billing status.";
  }

  const payment = parameters.get("payment");
  if (payment === "succeeded") return "Payment verified. Premium access is active.";
  if (payment === "pending") return "Payment is still pending. Refresh this page after a moment.";
  if (payment === "failed") return "Payment was not completed. No Premium access was granted.";
  if (payment === "cancelled") return "Checkout was cancelled. No payment was recorded.";
  if (payment === "expired") return "The checkout session expired. Start a new checkout when ready.";
  if (payment === "refunded") return "The payment was refunded and Premium access was updated.";
  return null;
}

function shouldPollBillingReturn(): boolean {
  const parameters = new URLSearchParams(window.location.search);
  return parameters.get("billingReturn") === "1" || parameters.has("wallet");
}

function displayPlan(code: string): string {
  if (code === "monthly") return "SkillUp Premium Monthly";
  if (code === "yearly") return "SkillUp Premium Yearly";
  return code.replaceAll("-", " ");
}

function billingReturnResolved(status: BillingStatus): boolean {
  if (["failed", "unlinked"].includes(status.wallet.status)) return true;
  if (status.wallet.status !== "linked") return false;
  if (status.alreadySubscribed) return true;
  return status.subscriptions.some((subscription) =>
    OPEN_SUBSCRIPTION_STATUSES.includes(subscription.status),
  );
}

export function MembershipAccount() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<AccountResponse>({});
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [payments, setPayments] = useState<readonly BillingPayment[]>([]);
  const [billingAvailable, setBillingAvailable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(
    async (signal: AbortSignal | null = null): Promise<BillingStatus | null> => {
      setError(null);
      try {
        const accountResponse = await fetch("/api/v1/commercial/account", {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });
        if (accountResponse.status === 401) {
          window.location.replace(withReturnTo("/en/sign-in", "/en/account"));
          return null;
        }
        if (!accountResponse.ok) {
          setError("Your membership information is temporarily unavailable.");
          return null;
        }
        setAccount((await accountResponse.json()) as AccountResponse);

        const [statusResponse, paymentsResponse] = await Promise.all([
          fetch("/api/v1/billing/status", {
            credentials: "same-origin",
            cache: "no-store",
            signal,
          }),
          fetch("/api/v1/billing/payments", {
            credentials: "same-origin",
            cache: "no-store",
            signal,
          }),
        ]);

        if (statusResponse.ok && paymentsResponse.ok) {
          const nextBilling = (await statusResponse.json()) as BillingStatus;
          setBilling(nextBilling);
          setPayments((await paymentsResponse.json()) as readonly BillingPayment[]);
          setBillingAvailable(true);
          return nextBilling;
        }
        if ([404, 503].includes(statusResponse.status)) {
          setBilling(null);
          setPayments([]);
          setBillingAvailable(false);
          return null;
        }
        if (statusResponse.status === 401) {
          window.location.replace(withReturnTo("/en/sign-in", "/en/account"));
          return null;
        }
        setBillingAvailable(true);
        setError("Billing status is temporarily unavailable. Your learning account remains safe.");
        return null;
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError("Your membership information is temporarily unavailable.");
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pollReturn = shouldPollBillingReturn();
    let attempt = 0;
    setMessage(queryMessage());

    const load = async () => {
      const status = await loadAccount(controller.signal);
      if (!pollReturn || controller.signal.aborted) return;
      if (status && billingReturnResolved(status)) return;
      attempt += 1;
      if (attempt >= 12) {
        setMessage(
          "Wallet return received, but billing is still processing. Use Refresh status shortly; Premium will change only after authoritative confirmation.",
        );
        return;
      }
      timer = setTimeout(() => void load(), 2_500);
    };

    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [loadAccount]);

  async function mutateBilling(path: string, successMessage: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Readonly<{ message?: string }>;
        setError(body.message ?? "The billing request could not be completed.");
        return;
      }
      setMessage(successMessage);
      await loadAccount();
    } catch {
      setError("The billing request could not be completed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <section className={styles["panel"]}>Loading your private membership…</section>;
  }

  const entitlement = account.entitlement ?? null;
  const legacyOrders = account.orders ?? [];
  const subscription =
    billing?.subscriptions.find((candidate) =>
      OPEN_SUBSCRIPTION_STATUSES.includes(candidate.status),
    ) ?? billing?.subscriptions[0] ?? null;

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
                ? `${entitlement.status} through ${dateLabel(entitlement.graceEndsAt ?? entitlement.endsAt)}`
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
            {entitlement ? "Compare plans" : "View Premium plans"}
          </Link>
          <Link className={`${styles["button"]} ${styles["secondary"]}`} href="/en/progress">
            View learning progress
          </Link>
          <button
            className={`${styles["button"]} ${styles["secondary"]}`}
            type="button"
            disabled={busy}
            onClick={() => void loadAccount()}
          >
            Refresh status
          </button>
        </div>
      </section>

      {billingAvailable && billing ? (
        <section className={styles["panel"]} aria-labelledby="billing-status-title">
          <h2 id="billing-status-title">JazzCash billing</h2>
          <div className={styles["billingGrid"]}>
            <div>
              <strong>Wallet</strong>
              <span>
                {billing.wallet.status}
                {billing.wallet.msisdn_masked ? ` · ${billing.wallet.msisdn_masked}` : ""}
              </span>
            </div>
            <div>
              <strong>Subscription</strong>
              <span>
                {subscription ? `${displayPlan(subscription.plan_code)} · ${subscription.status}` : "None"}
              </span>
            </div>
            <div>
              <strong>Current period</strong>
              <span>
                {subscription?.current_period_end
                  ? `Access through ${dateLabel(subscription.current_period_end)}`
                  : subscription?.trial_ends_at
                    ? `Trial through ${dateLabel(subscription.trial_ends_at)}`
                    : "No active paid period"}
              </span>
            </div>
            <div>
              <strong>Next billing</strong>
              <span>
                {subscription?.next_due_at
                  ? `${money(subscription.amount_minor)} on ${dateLabel(subscription.next_due_at)}`
                  : "No upcoming charge shown"}
              </span>
            </div>
          </div>

          <p className={styles["billingNote"]}>
            Cancel subscription stops future renewal for this plan while keeping the wallet linked.
            Unlink wallet removes the saved JazzCash authorization and stops all future debits for
            SkillUp. Already-paid access remains available through the current paid period.
          </p>

          <div className={styles["actions"]}>
            {subscription && !["canceled", "expired", "payment_failed"].includes(subscription.status) ? (
              <button
                className={`${styles["button"]} ${styles["secondary"]}`}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Cancel this Premium subscription? Future renewal will stop, but your JazzCash wallet remains linked.",
                    )
                  ) {
                    void mutateBilling(
                      `/api/v1/billing/subscriptions/${encodeURIComponent(subscription.id)}/cancel`,
                      "Subscription canceled. Paid-period access is retained through its recorded end date.",
                    );
                  }
                }}
              >
                Cancel subscription
              </button>
            ) : null}
            {billing.wallet.status === "linked" ? (
              <button
                className={`${styles["button"]} ${styles["dangerButton"]}`}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Unlink JazzCash wallet? This removes the saved authorization and stops future SkillUp debits.",
                    )
                  ) {
                    void mutateBilling(
                      "/api/v1/billing/wallet/unlink",
                      "JazzCash wallet unlinked. Future SkillUp debits are stopped.",
                    );
                  }
                }}
              >
                Unlink JazzCash wallet
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className={styles["panel"]} aria-labelledby="payment-history-title">
        <h2 id="payment-history-title">Payment history</h2>
        {billingAvailable ? (
          payments.length === 0 ? (
            <p>No payment has been recorded for this account.</p>
          ) : (
            <table className={styles["orders"]}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Charge</th>
                  <th>Created</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.status}</td>
                    <td>{money(payment.amount_minor)}</td>
                    <td>{payment.charge_kind ?? "—"}</td>
                    <td>{dateLabel(payment.created_at)}</td>
                    <td className={styles["reference"]}>{payment.txn_ref_no ?? payment.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : legacyOrders.length === 0 ? (
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
              {legacyOrders.map((order) => (
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
