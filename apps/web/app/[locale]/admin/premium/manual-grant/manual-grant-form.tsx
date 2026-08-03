"use client";

import { type FormEvent, useEffect, useState } from "react";

import styles from "../premium.module.css";

type AccessResponse = Readonly<{
  premium: Readonly<{ canAdjustSubscriptions: boolean }>;
}>;

type PlanResponse = Readonly<{
  plans: readonly Readonly<Record<string, unknown>>[];
}>;

async function message(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
  } catch {
    // Use the safe fallback.
  }
  return fallback;
}

export function ManualGrantForm() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [plans, setPlans] = useState<readonly Readonly<Record<string, unknown>>[]>([]);
  const [userId, setUserId] = useState("");
  const [planVersionId, setPlanVersionId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const [accessResponse, plansResponse] = await Promise.all([
          fetch("/api/v1/admin/reports/premium/access", {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/v1/admin/reports/premium/plans", {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        if (!accessResponse.ok) throw new Error(await message(accessResponse, "Access could not be verified."));
        const access = (await accessResponse.json()) as AccessResponse;
        setAllowed(access.premium.canAdjustSubscriptions);
        if (plansResponse.ok) {
          const catalog = (await plansResponse.json()) as PlanResponse;
          const active = catalog.plans.filter((plan) => plan["versionStatus"] === "active");
          setPlans(active);
          const first = active[0]?.["versionId"];
          if (typeof first === "string") setPlanVersionId(first);
        }
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(requestError instanceof Error ? requestError.message : "The grant form could not load.");
        }
      }
    })();
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const response = await fetch("/api/v1/admin/reports/premium/memberships/manual-grants", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
          planVersionId,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          reason: reason.trim(),
          evidenceReference: evidenceReference.trim() || null,
        }),
      });
      if (!response.ok) throw new Error(await message(response, "The manual grant was not created."));
      setStatus("The non-paid Premium grant was created with entitlement and privileged audit evidence.");
      setUserId("");
      setStartsAt("");
      setEndsAt("");
      setReason("");
      setEvidenceReference("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The manual grant failed safely.");
    } finally {
      setBusy(false);
    }
  }

  if (allowed === false) {
    return <p className={`${styles["message"]} ${styles["error"]}`}>Your role cannot create manual Premium grants.</p>;
  }

  return (
    <section className={styles["sectionStack"]}>
      {status ? <p className={styles["message"]}>{status}</p> : null}
      {error ? (
        <p className={`${styles["message"]} ${styles["error"]}`} role="alert">
          {error}
        </p>
      ) : null}
      <form className={styles["panelForm"]} onSubmit={(event) => void submit(event)}>
        <h2>Manual grant authority</h2>
        <label>
          <span>Learner user UUID</span>
          <input value={userId} onChange={(event) => setUserId(event.target.value)} required />
        </label>
        <label>
          <span>Approved active plan version</span>
          <select value={planVersionId} onChange={(event) => setPlanVersionId(event.target.value)} required>
            {plans.map((plan) => (
              <option value={String(plan["versionId"])} key={String(plan["versionId"])}>
                {String(plan["planName"])} v{String(plan["version"])} — PKR {Number(plan["amountMinor"] ?? 0) / 100}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Starts at</span>
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
        </label>
        <label>
          <span>Ends at</span>
          <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
        </label>
        <label className={styles["full"]}>
          <span>Reason</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} required />
        </label>
        <label className={styles["full"]}>
          <span>Evidence reference</span>
          <input
            value={evidenceReference}
            onChange={(event) => setEvidenceReference(event.target.value)}
            placeholder="Support ticket, approval or campaign reference"
          />
        </label>
        <button type="submit" disabled={busy || allowed !== true || plans.length === 0}>
          Confirm non-paid grant
        </button>
        <p className={styles["hint"]}>
          This operation never creates a payment or revenue effect and cannot be used to mark a payment successful.
        </p>
      </form>
    </section>
  );
}
