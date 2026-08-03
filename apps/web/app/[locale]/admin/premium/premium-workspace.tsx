"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import styles from "./premium.module.css";

type Tab =
  | "summary"
  | "payments"
  | "memberships"
  | "recurring"
  | "reconciliation"
  | "plans"
  | "exports";

type Filters = Readonly<{
  preset:
    | "today"
    | "yesterday"
    | "last_7_days"
    | "last_30_days"
    | "current_month"
    | "previous_month"
    | "custom";
  aggregation: "daily" | "monthly";
  from: string;
  to: string;
  planCode: string;
  paymentPurpose: string;
  paymentStatus: string;
  membershipStatus: string;
  search: string;
}>;

type PremiumAccess = Readonly<{
  capabilities: readonly string[];
  canReadReports: boolean;
  canExportReports: boolean;
  canReadSubscriptions: boolean;
  canAdjustSubscriptions: boolean;
  canReadPlans: boolean;
  canManagePlans: boolean;
  canReconcilePayments: boolean;
}>;

type SummaryReport = Readonly<{
  reportSchemaVersion: string;
  timezone: string;
  effectiveRange: Readonly<{ from: string; to: string; preset: string }>;
  metricDefinitions: Readonly<Record<string, string>>;
  summary: Readonly<Record<string, string | number | null>>;
  buckets: readonly Readonly<Record<string, string | number | null>>[];
  planBreakdown: readonly Readonly<Record<string, string | number | null>>[];
}>;

type LedgerResponse = Readonly<{
  timezone: string;
  effectiveRange: Readonly<{ from: string; to: string; preset: string }>;
  total: number;
  limit: number;
  offset: number;
  items: readonly Readonly<Record<string, unknown>>[];
}>;

type PlanResponse = Readonly<{
  featureState: Readonly<Record<string, unknown>>;
  plans: readonly Readonly<Record<string, unknown>>[];
}>;

type ExportRecord = Readonly<Record<string, unknown>>;
type ExportHistory = Readonly<{ exports: readonly ExportRecord[] }>;

type ApiFailure = Readonly<{ message?: string }>;

const defaultFilters: Filters = {
  preset: "last_30_days",
  aggregation: "daily",
  from: "",
  to: "",
  planCode: "",
  paymentPurpose: "",
  paymentStatus: "",
  membershipStatus: "",
  search: "",
};

const tabs: readonly Readonly<{ id: Tab; label: string }>[] = [
  { id: "summary", label: "Summary" },
  { id: "payments", label: "Payments" },
  { id: "memberships", label: "Memberships" },
  { id: "recurring", label: "Recurring customers" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "plans", label: "Plans" },
  { id: "exports", label: "Exports" },
];

function initialState(): Readonly<{ tab: Tab; filters: Filters; offset: number }> {
  if (typeof window === "undefined") return { tab: "summary", filters: defaultFilters, offset: 0 };
  const search = new URLSearchParams(window.location.search);
  const tabValue = search.get("tab");
  const tab = tabs.some((entry) => entry.id === tabValue) ? (tabValue as Tab) : "summary";
  const preset = search.get("preset");
  const aggregation = search.get("aggregation");
  return {
    tab,
    offset: Math.max(0, Number(search.get("offset") ?? 0) || 0),
    filters: {
      preset: [
        "today",
        "yesterday",
        "last_7_days",
        "last_30_days",
        "current_month",
        "previous_month",
        "custom",
      ].includes(preset ?? "")
        ? (preset as Filters["preset"])
        : defaultFilters.preset,
      aggregation: aggregation === "monthly" ? "monthly" : "daily",
      from: search.get("from") ?? "",
      to: search.get("to") ?? "",
      planCode: search.get("planCode") ?? "",
      paymentPurpose: search.get("paymentPurpose") ?? "",
      paymentStatus: search.get("paymentStatus") ?? "",
      membershipStatus: search.get("membershipStatus") ?? "",
      search: search.get("search") ?? "",
    },
  };
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiFailure;
    if (typeof body.message === "string") return body.message;
  } catch {
    // Preserve the bounded fallback instead of exposing an upstream response.
  }
  return fallback;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...(init.headers ?? {}) }
      : init?.headers,
  });
  if (!response.ok) throw new Error(await errorMessage(response, "The Premium request failed."));
  return (await response.json()) as T;
}

function reportQuery(filters: Filters, includeSearch = false, offset = 0): string {
  const query = new URLSearchParams({
    preset: filters.preset,
    aggregation: filters.aggregation,
  });
  if (filters.preset === "custom") {
    if (filters.from) query.set("from", new Date(filters.from).toISOString());
    if (filters.to) query.set("to", new Date(filters.to).toISOString());
  }
  if (filters.planCode) query.set("planCode", filters.planCode);
  if (filters.paymentPurpose) query.set("paymentPurpose", filters.paymentPurpose);
  if (filters.paymentStatus) query.set("paymentStatus", filters.paymentStatus);
  if (filters.membershipStatus) query.set("membershipStatus", filters.membershipStatus);
  if (includeSearch && filters.search) query.set("search", filters.search);
  if (includeSearch) {
    query.set("limit", "50");
    query.set("offset", String(offset));
  }
  return query.toString();
}

function filtersPayload(filters: Filters): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    preset: filters.preset,
    aggregation: filters.aggregation,
  };
  if (filters.preset === "custom") {
    payload["from"] = new Date(filters.from).toISOString();
    payload["to"] = new Date(filters.to).toISOString();
  }
  if (filters.planCode) payload["planCode"] = filters.planCode;
  if (filters.paymentPurpose) payload["paymentPurpose"] = filters.paymentPurpose;
  if (filters.paymentStatus) payload["paymentStatus"] = filters.paymentStatus;
  if (filters.membershipStatus) payload["membershipStatus"] = filters.membershipStatus;
  return payload;
}

function money(value: unknown): string {
  const minor = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

function dateTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(parsed);
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function statusClass(value: unknown): string {
  const normalized = String(value ?? "").toLowerCase();
  if (["active", "succeeded", "completed", "resolved", "published"].includes(normalized)) {
    return styles["statusGood"] ?? "";
  }
  if (["pending", "grace", "open", "draft", "scheduled"].includes(normalized)) {
    return styles["statusWarn"] ?? "";
  }
  return styles["statusBad"] ?? "";
}

function KpiCard({
  label,
  value,
  explanation,
}: Readonly<{ label: string; value: string; explanation?: string | undefined }>) {
  return (
    <article className={styles["kpi"]}>
      <span>{label}</span>
      <strong>{value}</strong>
      {explanation ? <small>{explanation}</small> : null}
    </article>
  );
}

export function PremiumWorkspace() {
  const initial = useMemo(initialState, []);
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [offset, setOffset] = useState(initial.offset);
  const [access, setAccess] = useState<PremiumAccess | null>(null);
  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [plans, setPlans] = useState<PlanResponse | null>(null);
  const [exports, setExports] = useState<ExportHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reconciliationReasons, setReconciliationReasons] = useState<Record<string, string>>({});
  const [selectedMembership, setSelectedMembership] = useState<Readonly<
    Record<string, unknown>
  > | null>(null);
  const [adjustStatus, setAdjustStatus] = useState("active");
  const [adjustEnd, setAdjustEnd] = useState("");
  const [adjustGrace, setAdjustGrace] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustEvidence, setAdjustEvidence] = useState("");
  const [planReason, setPlanReason] = useState("");
  const [draftPlan, setDraftPlan] = useState({
    planCode: "premium-monthly",
    amount: "599",
    billingPeriod: "month",
    termsVersion: "launch-v1",
    capabilities: "expanded_levels,detailed_progress,advanced_ai_challenges,premium_avatars",
    effectiveAt: "",
  });
  const [exportType, setExportType] = useState("summary");
  const [exportReason, setExportReason] = useState("");

  useEffect(() => {
    const query = new URLSearchParams();
    query.set("tab", tab);
    query.set("preset", filters.preset);
    query.set("aggregation", filters.aggregation);
    if (filters.preset === "custom") {
      if (filters.from) query.set("from", filters.from);
      if (filters.to) query.set("to", filters.to);
    }
    if (filters.planCode) query.set("planCode", filters.planCode);
    if (filters.paymentPurpose) query.set("paymentPurpose", filters.paymentPurpose);
    if (filters.paymentStatus) query.set("paymentStatus", filters.paymentStatus);
    if (filters.membershipStatus) query.set("membershipStatus", filters.membershipStatus);
    if (filters.search) query.set("search", filters.search);
    if (offset) query.set("offset", String(offset));
    window.history.replaceState(null, "", `${window.location.pathname}?${query.toString()}`);
  }, [filters, offset, tab]);

  const loadAccess = useCallback(async () => {
    const response = await requestJson<Readonly<{ premium: PremiumAccess }>>(
      "/admin/reports/premium/access",
    );
    setAccess(response.premium);
    return response.premium;
  }, []);

  const loadCurrent = useCallback(
    async (signal: AbortSignal | null = null) => {
      setLoading(true);
      setError(null);
      try {
        const currentAccess = access ?? (await loadAccess());
        if (!currentAccess.canReadReports && !currentAccess.canReadPlans) {
          throw new Error("Your administrative role does not include Premium reporting access.");
        }
        if (filters.preset === "custom" && (!filters.from || !filters.to)) {
          throw new Error("Select both custom range boundaries before loading the report.");
        }

        if (tab === "summary") {
          const report = await requestJson<SummaryReport>(
            `/admin/reports/premium/summary?${reportQuery(filters)}`,
            { signal },
          );
          setSummary(report);
        } else if (tab === "plans") {
          setPlans(await requestJson<PlanResponse>("/admin/reports/premium/plans", { signal }));
        } else if (tab === "exports") {
          setExports(
            await requestJson<ExportHistory>("/admin/reports/premium/exports?limit=50", {
              signal,
            }),
          );
        } else {
          const route =
            tab === "payments"
              ? "payments"
              : tab === "memberships"
                ? "memberships"
                : tab === "recurring"
                  ? "recurring-customers"
                  : "reconciliation";
          setLedger(
            await requestJson<LedgerResponse>(
              `/admin/reports/premium/${route}?${reportQuery(filters, true, offset)}`,
              { signal },
            ),
          );
        }
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(
            requestError instanceof Error ? requestError.message : "The report could not load.",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [access, filters, loadAccess, offset, tab],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadCurrent(controller.signal);
    return () => controller.abort();
  }, [loadCurrent]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]): void {
    setFilters((current) => ({ ...current, [key]: value }));
    setOffset(0);
  }

  async function runMutation(key: string, operation: () => Promise<void>, success: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
      await loadCurrent();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The operation failed safely.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function resolveReconciliation(id: string, disposition: "resolved" | "ignored") {
    const resolution = reconciliationReasons[id]?.trim();
    if (!resolution) {
      setError("Enter a reconciliation reason first.");
      return;
    }
    await runMutation(
      `reconcile:${id}`,
      async () => {
        await requestJson(`/admin/reconciliation/${id}/resolve`, {
          method: "POST",
          body: JSON.stringify({ disposition, resolution }),
        });
      },
      "The reconciliation case was updated with preserved evidence.",
    );
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entitlementId = selectedMembership?.["entitlementId"];
    if (typeof entitlementId !== "string") return;
    if (!adjustReason.trim()) {
      setError("Membership adjustments require a reason.");
      return;
    }
    await runMutation(
      `adjust:${entitlementId}`,
      async () => {
        const body: Record<string, unknown> = {
          nextStatus: adjustStatus,
          reason: adjustReason.trim(),
          evidenceReference: adjustEvidence.trim() || null,
        };
        if (adjustEnd) body["endsAt"] = new Date(adjustEnd).toISOString();
        if (adjustGrace) body["graceEndsAt"] = new Date(adjustGrace).toISOString();
        await requestJson(`/admin/entitlements/${entitlementId}/correct`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        setSelectedMembership(null);
        setAdjustReason("");
        setAdjustEvidence("");
      },
      "The membership authority was adjusted and audited.",
    );
  }

  async function createPlanVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planReason.trim()) {
      setError("Plan changes require an approval reason.");
      return;
    }
    await runMutation(
      "create-plan",
      async () => {
        await requestJson("/admin/reports/premium/plans/versions", {
          method: "POST",
          body: JSON.stringify({
            planCode: draftPlan.planCode,
            amountMinor: Math.round(Number(draftPlan.amount) * 100),
            currency: "PKR",
            billingPeriod: draftPlan.billingPeriod,
            capabilities: draftPlan.capabilities
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
            termsVersion: draftPlan.termsVersion,
            effectiveAt: draftPlan.effectiveAt
              ? new Date(draftPlan.effectiveAt).toISOString()
              : null,
            reason: planReason.trim(),
          }),
        });
      },
      "The immutable draft plan version was created.",
    );
  }

  async function transitionPlan(versionId: string, action: "activate" | "retire") {
    if (!planReason.trim()) {
      setError("Plan activation or retirement requires a reason.");
      return;
    }
    await runMutation(
      `${action}:${versionId}`,
      async () => {
        await requestJson(`/admin/reports/premium/plans/versions/${versionId}/${action}`, {
          method: "POST",
          body: JSON.stringify({ reason: planReason.trim(), confirmation: "CONFIRM" }),
        });
      },
      `The plan version was ${action === "activate" ? "activated" : "retired"} with audit evidence.`,
    );
  }

  async function createExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exportReason.trim()) {
      setError("Exports require a business reason.");
      return;
    }
    await runMutation(
      "create-export",
      async () => {
        await requestJson("/admin/reports/premium/exports", {
          method: "POST",
          body: JSON.stringify({
            reportType: exportType,
            filters: filtersPayload(filters),
            reason: exportReason.trim(),
          }),
        });
      },
      "The backend-generated report file is ready for authorized download.",
    );
  }

  function changeTab(next: Tab): void {
    setTab(next);
    setOffset(0);
    setError(null);
    setMessage(null);
  }

  const summaryMetrics = summary?.summary ?? {};
  const metricDefinitions = summary?.metricDefinitions ?? {};
  const maxBucket = Math.max(
    1,
    ...(summary?.buckets ?? []).map((bucket) => Number(bucket["grossMinor"] ?? 0)),
  );

  return (
    <section className={styles["workspace"]} aria-label="Premium administration workspace">
      {access ? (
        <div className={styles["access"]}>
          <strong>Effective Premium capabilities</strong>
          <span>{access.capabilities.join(", ")}</span>
        </div>
      ) : null}

      <nav className={styles["tabs"]} aria-label="Premium workspace sections">
        {tabs.map((entry) => {
          const hidden =
            (entry.id === "exports" && !access?.canExportReports) ||
            (entry.id === "plans" && !access?.canReadPlans) ||
            (["payments", "memberships"].includes(entry.id) && !access?.canReadSubscriptions);
          if (hidden) return null;
          return (
            <button
              className={tab === entry.id ? styles["tabActive"] : styles["tab"]}
              type="button"
              key={entry.id}
              onClick={() => changeTab(entry.id)}
              aria-current={tab === entry.id ? "page" : undefined}
            >
              {entry.label}
            </button>
          );
        })}
      </nav>

      {tab !== "plans" && tab !== "exports" ? (
        <form
          className={styles["filters"]}
          onSubmit={(event) => {
            event.preventDefault();
            void loadCurrent();
          }}
        >
          <label>
            <span>Range</span>
            <select
              value={filters.preset}
              onChange={(event) => setFilter("preset", event.target.value as Filters["preset"])}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last_7_days">Last 7 days</option>
              <option value="last_30_days">Last 30 days</option>
              <option value="current_month">Current month</option>
              <option value="previous_month">Previous month</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {filters.preset === "custom" ? (
            <>
              <label>
                <span>From</span>
                <input
                  type="datetime-local"
                  value={filters.from}
                  onChange={(event) => setFilter("from", event.target.value)}
                  required
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="datetime-local"
                  value={filters.to}
                  onChange={(event) => setFilter("to", event.target.value)}
                  required
                />
              </label>
            </>
          ) : null}
          <label>
            <span>Aggregation</span>
            <select
              value={filters.aggregation}
              onChange={(event) =>
                setFilter("aggregation", event.target.value as Filters["aggregation"])
              }
            >
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label>
            <span>Plan</span>
            <select
              value={filters.planCode}
              onChange={(event) => setFilter("planCode", event.target.value)}
            >
              <option value="">All plans</option>
              <option value="premium-monthly">Premium monthly</option>
              <option value="premium-yearly">Premium yearly</option>
            </select>
          </label>
          <label>
            <span>Purpose</span>
            <select
              value={filters.paymentPurpose}
              onChange={(event) => setFilter("paymentPurpose", event.target.value)}
            >
              <option value="">All purposes</option>
              <option value="activation">Activation</option>
              <option value="renewal">Renewal</option>
              <option value="reactivation">Reactivation</option>
            </select>
          </label>
          <label>
            <span>Payment status</span>
            <select
              value={filters.paymentStatus}
              onChange={(event) => setFilter("paymentStatus", event.target.value)}
            >
              <option value="">All payment statuses</option>
              {[
                "created",
                "pending",
                "succeeded",
                "failed",
                "cancelled",
                "expired",
                "refunded",
              ].map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Membership status</span>
            <select
              value={filters.membershipStatus}
              onChange={(event) => setFilter("membershipStatus", event.target.value)}
            >
              <option value="">All membership statuses</option>
              {["active", "grace", "expired", "cancelled", "refunded", "revoked"].map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          {tab !== "summary" && tab !== "reconciliation" ? (
            <label className={styles["search"]}>
              <span>Authorized reference search</span>
              <input
                value={filters.search}
                onChange={(event) => setFilter("search", event.target.value)}
                placeholder="User, payment, entitlement or membership UUID"
              />
            </label>
          ) : null}
          <button type="submit" disabled={loading}>
            Apply filters
          </button>
        </form>
      ) : null}

      {summary || ledger ? (
        <p className={styles["range"]}>
          Reporting timezone:{" "}
          <strong>{summary?.timezone ?? ledger?.timezone ?? "Asia/Karachi"}</strong>
          {summary?.effectiveRange || ledger?.effectiveRange ? (
            <>
              {" "}
              · Effective range{" "}
              {dateTime(summary?.effectiveRange.from ?? ledger?.effectiveRange.from)} to{" "}
              {dateTime(summary?.effectiveRange.to ?? ledger?.effectiveRange.to)}
            </>
          ) : null}
        </p>
      ) : null}

      {message ? <p className={styles["message"]}>{message}</p> : null}
      {error ? (
        <p className={`${styles["message"]} ${styles["error"]}`} role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className={styles["loading"]}>Loading authoritative Premium data…</p> : null}

      {!loading && tab === "summary" && summary ? (
        <div className={styles["sectionStack"]}>
          <section aria-labelledby="premium-kpis">
            <h2 id="premium-kpis">Premium and collections summary</h2>
            <div className={styles["kpiGrid"]}>
              <KpiCard
                label="Gross collections"
                value={money(summaryMetrics["grossCollectionsMinor"])}
              />
              <KpiCard label="Refunds" value={money(summaryMetrics["refundsMinor"])} />
              <KpiCard
                label="Net collections"
                value={money(summaryMetrics["netCollectionsMinor"])}
              />
              <KpiCard
                label="Payment success"
                value={
                  summaryMetrics["paymentSuccessRate"] === null
                    ? "—"
                    : `${text(summaryMetrics["paymentSuccessRate"])}%`
                }
                explanation={metricDefinitions["paymentSuccessRate"]}
              />
              <KpiCard
                label="New paid activations"
                value={text(summaryMetrics["newPaidActivations"])}
              />
              <KpiCard
                label="Successful renewals"
                value={text(summaryMetrics["successfulRenewals"])}
              />
              <KpiCard
                label="Renewal success"
                value={
                  summaryMetrics["renewalSuccessRate"] === null
                    ? "—"
                    : `${text(summaryMetrics["renewalSuccessRate"])}%`
                }
                explanation={metricDefinitions["renewalSuccessRate"]}
              />
              <KpiCard
                label="Actual recurring customers"
                value={text(summaryMetrics["recurringCustomers"])}
                explanation={metricDefinitions["recurringCustomers"]}
              />
              <KpiCard
                label="Active memberships"
                value={text(summaryMetrics["activeMemberships"])}
              />
              <KpiCard label="Grace memberships" value={text(summaryMetrics["graceMemberships"])} />
              <KpiCard
                label="Approaching renewal"
                value={text(summaryMetrics["approachingRenewal"])}
              />
              <KpiCard label="Manual grants" value={text(summaryMetrics["manualGrants"])} />
              <KpiCard
                label="MRR"
                value={money(summaryMetrics["mrrMinor"])}
                explanation={metricDefinitions["mrr"]}
              />
              <KpiCard
                label="ARR"
                value={money(summaryMetrics["arrMinor"])}
                explanation={metricDefinitions["arr"]}
              />
              <KpiCard label="Failed attempts" value={text(summaryMetrics["failedAttempts"])} />
              <KpiCard
                label="Open reconciliation"
                value={text(summaryMetrics["openReconciliationCases"])}
              />
            </div>
          </section>

          <section aria-labelledby="collections-chart">
            <h2 id="collections-chart">Collections over time</h2>
            <p className={styles["hint"]}>
              Cash collected in a month is not MRR. These bars show authoritative capture effects.
            </p>
            <div className={styles["bars"]}>
              {summary.buckets.length === 0 ? (
                <p>No collection effects match the selected filters.</p>
              ) : null}
              {summary.buckets.map((bucket) => {
                const gross = Number(bucket["grossMinor"] ?? 0);
                return (
                  <div className={styles["barRow"]} key={String(bucket["bucket"])}>
                    <span>{text(bucket["bucket"])}</span>
                    <div className={styles["barTrack"]}>
                      <span style={{ width: `${Math.max(2, (gross / maxBucket) * 100)}%` }} />
                    </div>
                    <strong>{money(gross)}</strong>
                  </div>
                );
              })}
            </div>
            <div className={styles["tableWrap"]}>
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Gross</th>
                    <th>Refunds</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.buckets.map((bucket) => (
                    <tr key={`table-${String(bucket["bucket"])}`}>
                      <td>{text(bucket["bucket"])}</td>
                      <td>{money(bucket["grossMinor"])}</td>
                      <td>{money(bucket["refundMinor"])}</td>
                      <td>{money(bucket["netMinor"])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="plan-breakdown">
            <h2 id="plan-breakdown">Revenue by immutable plan version</h2>
            <div className={styles["tableWrap"]}>
              <table>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Version</th>
                    <th>Stored price</th>
                    <th>Gross</th>
                    <th>Refunds</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.planBreakdown.map((row) => (
                    <tr key={`${text(row["planCode"])}:${text(row["version"])}`}>
                      <td>{text(row["planName"])}</td>
                      <td>{text(row["version"])}</td>
                      <td>{money(row["planAmountMinor"])}</td>
                      <td>{money(row["grossMinor"])}</td>
                      <td>{money(row["refundMinor"])}</td>
                      <td>{money(row["netMinor"])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {!loading && tab === "payments" && ledger ? (
        <section aria-labelledby="payment-ledger">
          <h2 id="payment-ledger">Authoritative payment ledger</h2>
          <p className={styles["hint"]}>
            Provider payloads and secure hashes are intentionally excluded.
          </p>
          <div className={styles["tableWrap"]}>
            <table>
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Plan snapshot</th>
                  <th>Purpose</th>
                  <th>Amount</th>
                  <th>Internal</th>
                  <th>Provider</th>
                  <th>Initiated</th>
                  <th>Completed/refunded</th>
                  <th>Reconciliation</th>
                </tr>
              </thead>
              <tbody>
                {ledger.items.map((item) => (
                  <tr key={String(item["id"])}>
                    <td>{text(item["learnerReference"])}</td>
                    <td>
                      {text(item["planName"])} v{text(item["planVersion"])}
                    </td>
                    <td>{text(item["purpose"])}</td>
                    <td>{money(item["amountMinor"])}</td>
                    <td>
                      <span
                        className={`${styles["status"]} ${statusClass(item["internalStatus"])}`}
                      >
                        {text(item["internalStatus"])}
                      </span>
                    </td>
                    <td>{text(item["providerStatus"])}</td>
                    <td>{dateTime(item["initiatedAt"])}</td>
                    <td>{dateTime(item["refundedAt"] ?? item["completedAt"])}</td>
                    <td>{text(item["reconciliationState"])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && tab === "memberships" && ledger ? (
        <section aria-labelledby="membership-ledger">
          <h2 id="membership-ledger">Membership and entitlement ledger</h2>
          <div className={styles["tableWrap"]}>
            <table>
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Origin</th>
                  <th>Purpose</th>
                  <th>Period</th>
                  <th>Renewals</th>
                  <th>Lifetime net collections</th>
                  {access?.canAdjustSubscriptions ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {ledger.items.map((item) => (
                  <tr key={String(item["id"])}>
                    <td>{text(item["learnerReference"])}</td>
                    <td>{text(item["planName"])}</td>
                    <td>
                      <span className={`${styles["status"]} ${statusClass(item["status"])}`}>
                        {text(item["status"])}
                      </span>
                    </td>
                    <td>{text(item["origin"])}</td>
                    <td>{text(item["purpose"])}</td>
                    <td>
                      {dateTime(item["periodStart"])} → {dateTime(item["periodEnd"])}
                    </td>
                    <td>
                      {text(item["renewalCount"])} successful / {text(item["failedRenewalCount"])}{" "}
                      failed
                    </td>
                    <td>{money(item["lifetimeCollectedMinor"])}</td>
                    {access?.canAdjustSubscriptions ? (
                      <td>
                        <button
                          type="button"
                          className={styles["smallButton"]}
                          onClick={() => {
                            setSelectedMembership(item);
                            setAdjustStatus(String(item["status"] ?? "active"));
                            setAdjustEnd(
                              typeof item["periodEnd"] === "string"
                                ? item["periodEnd"].slice(0, 16)
                                : "",
                            );
                            setAdjustGrace(
                              typeof item["graceEnd"] === "string"
                                ? item["graceEnd"].slice(0, 16)
                                : "",
                            );
                          }}
                        >
                          Adjust
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedMembership ? (
            <form
              className={styles["panelForm"]}
              onSubmit={(event) => void submitAdjustment(event)}
            >
              <h3>Audited membership adjustment</h3>
              <p>
                Current: {text(selectedMembership["status"])} · {text(selectedMembership["origin"])}{" "}
                · entitlement {text(selectedMembership["entitlementId"])}
              </p>
              <label>
                <span>Next status</span>
                <select
                  value={adjustStatus}
                  onChange={(event) => setAdjustStatus(event.target.value)}
                >
                  {["active", "grace", "expired", "cancelled", "refunded", "revoked"].map(
                    (status) => (
                      <option value={status} key={status}>
                        {status}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <span>Entitlement end</span>
                <input
                  type="datetime-local"
                  value={adjustEnd}
                  onChange={(event) => setAdjustEnd(event.target.value)}
                />
              </label>
              <label>
                <span>Grace end</span>
                <input
                  type="datetime-local"
                  value={adjustGrace}
                  onChange={(event) => setAdjustGrace(event.target.value)}
                />
              </label>
              <label>
                <span>Reason</span>
                <textarea
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Evidence reference</span>
                <input
                  value={adjustEvidence}
                  onChange={(event) => setAdjustEvidence(event.target.value)}
                />
              </label>
              <div className={styles["actions"]}>
                <button type="submit" disabled={busy !== null}>
                  Confirm adjustment
                </button>
                <button
                  type="button"
                  className={styles["secondary"]}
                  onClick={() => setSelectedMembership(null)}
                >
                  Cancel
                </button>
              </div>
              <p className={styles["hint"]}>
                This does not mark a payment successful. Payment authority remains immutable.
              </p>
            </form>
          ) : null}
        </section>
      ) : null}

      {!loading && tab === "recurring" && ledger ? (
        <section aria-labelledby="recurring-ledger">
          <h2 id="recurring-ledger">Actual recurring customers</h2>
          <p className={styles["hint"]}>
            A learner appears here only after at least one completed paid renewal. Auto-renew is not
            applicable to the current JazzCash model.
          </p>
          <div className={styles["tableWrap"]}>
            <table>
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Successful renewals</th>
                  <th>Failed renewals</th>
                  <th>Last renewal</th>
                  <th>Next manual renewal</th>
                  <th>Lifetime net collections</th>
                </tr>
              </thead>
              <tbody>
                {ledger.items.map((item) => (
                  <tr key={String(item["membershipPeriodId"])}>
                    <td>{text(item["learnerReference"])}</td>
                    <td>{text(item["planName"])}</td>
                    <td>{text(item["status"])}</td>
                    <td>{text(item["renewalCount"])}</td>
                    <td>{text(item["failedRenewalCount"])}</td>
                    <td>{dateTime(item["lastRenewalAt"])}</td>
                    <td>{dateTime(item["nextRenewalAt"])}</td>
                    <td>{money(item["lifetimeCollectedMinor"])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && tab === "reconciliation" && ledger ? (
        <section aria-labelledby="reconciliation-ledger">
          <h2 id="reconciliation-ledger">Reconciliation attention queue</h2>
          <div className={styles["cards"]}>
            {ledger.items.length === 0 ? (
              <p>No reconciliation exception matches the selected filters.</p>
            ) : null}
            {ledger.items.map((item) => {
              const id = String(item["id"]);
              return (
                <article className={styles["case"]} key={id}>
                  <div>
                    <h3>{text(item["mismatchKind"])}</h3>
                    <p>
                      {text(item["planName"])} · {money(item["amountMinor"])} ·{" "}
                      {text(item["orderStatus"])} ·{" "}
                      {Math.floor(Number(item["ageSeconds"] ?? 0) / 60)} minutes old
                    </p>
                  </div>
                  <dl>
                    <dt>Merchant reference</dt>
                    <dd>{text(item["merchantReference"])}</dd>
                    <dt>Membership</dt>
                    <dd>{text(item["membershipPeriodId"])}</dd>
                    <dt>Provider evidence</dt>
                    <dd>{text(item["providerEvidence"])}</dd>
                    <dt>Internal evidence</dt>
                    <dd>{text(item["internalEvidence"])}</dd>
                  </dl>
                  {item["status"] === "open" && access?.canReconcilePayments ? (
                    <>
                      <textarea
                        aria-label={`Resolution for ${id}`}
                        value={reconciliationReasons[id] ?? ""}
                        onChange={(event) =>
                          setReconciliationReasons((current) => ({
                            ...current,
                            [id]: event.target.value,
                          }))
                        }
                        placeholder="Evidence-based resolution reason"
                      />
                      <div className={styles["actions"]}>
                        <button
                          type="button"
                          onClick={() => void resolveReconciliation(id, "resolved")}
                        >
                          Resolve with evidence
                        </button>
                        <button
                          type="button"
                          className={styles["secondary"]}
                          onClick={() => void resolveReconciliation(id, "ignored")}
                        >
                          Ignore with reason
                        </button>
                      </div>
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {!loading && tab === "plans" && plans ? (
        <section className={styles["sectionStack"]} aria-labelledby="plan-admin">
          <div>
            <h2 id="plan-admin">Immutable Premium plan versions</h2>
            <p className={styles["hint"]}>
              Runtime Premium and JazzCash kill switches are read-only here. They remain protected
              deployment configuration.
            </p>
          </div>
          <div className={styles["tableWrap"]}>
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Version</th>
                  <th>Price</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Terms</th>
                  <th>Effective</th>
                  <th>Capabilities</th>
                  {access?.canManagePlans ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {plans.plans.map((plan) => (
                  <tr key={String(plan["versionId"])}>
                    <td>{text(plan["planName"])}</td>
                    <td>{text(plan["version"])}</td>
                    <td>{money(plan["amountMinor"])}</td>
                    <td>{text(plan["billingPeriod"])}</td>
                    <td>{text(plan["versionStatus"])}</td>
                    <td>{text(plan["termsVersion"])}</td>
                    <td>{dateTime(plan["effectiveAt"])}</td>
                    <td>
                      {Array.isArray(plan["capabilities"]) ? plan["capabilities"].join(", ") : "—"}
                    </td>
                    {access?.canManagePlans ? (
                      <td>
                        <div className={styles["inlineActions"]}>
                          {plan["versionStatus"] === "draft" ? (
                            <button
                              type="button"
                              className={styles["smallButton"]}
                              onClick={() =>
                                void transitionPlan(String(plan["versionId"]), "activate")
                              }
                            >
                              Activate
                            </button>
                          ) : null}
                          {plan["versionStatus"] !== "retired" ? (
                            <button
                              type="button"
                              className={`${styles["smallButton"]} ${styles["danger"]}`}
                              onClick={() =>
                                void transitionPlan(String(plan["versionId"]), "retire")
                              }
                            >
                              Retire
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {access?.canManagePlans ? (
            <form
              className={styles["panelForm"]}
              onSubmit={(event) => void createPlanVersion(event)}
            >
              <h3>Create approved draft version</h3>
              <label>
                <span>Plan</span>
                <select
                  value={draftPlan.planCode}
                  onChange={(event) =>
                    setDraftPlan((current) => ({
                      ...current,
                      planCode: event.target.value,
                      billingPeriod: event.target.value === "premium-monthly" ? "month" : "year",
                    }))
                  }
                >
                  <option value="premium-monthly">Premium monthly</option>
                  <option value="premium-yearly">Premium yearly</option>
                </select>
              </label>
              <label>
                <span>Price in PKR</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={draftPlan.amount}
                  onChange={(event) =>
                    setDraftPlan((current) => ({ ...current, amount: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                <span>Terms version</span>
                <input
                  value={draftPlan.termsVersion}
                  onChange={(event) =>
                    setDraftPlan((current) => ({ ...current, termsVersion: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                <span>Scheduled effective time</span>
                <input
                  type="datetime-local"
                  value={draftPlan.effectiveAt}
                  onChange={(event) =>
                    setDraftPlan((current) => ({ ...current, effectiveAt: event.target.value }))
                  }
                />
              </label>
              <label className={styles["full"]}>
                <span>Capabilities, comma-separated</span>
                <textarea
                  value={draftPlan.capabilities}
                  onChange={(event) =>
                    setDraftPlan((current) => ({ ...current, capabilities: event.target.value }))
                  }
                  required
                />
              </label>
              <label className={styles["full"]}>
                <span>Approval reason for create, activate or retire</span>
                <textarea
                  value={planReason}
                  onChange={(event) => setPlanReason(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={busy !== null}>
                Create draft plan version
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {!loading && tab === "exports" && exports ? (
        <section className={styles["sectionStack"]} aria-labelledby="exports-title">
          <div>
            <h2 id="exports-title">Audited backend-generated exports</h2>
            <p className={styles["hint"]}>
              Files use the same formulas and filters as the screen and expire after 24 hours. CSV
              is protected against spreadsheet formula injection.
            </p>
          </div>
          <form className={styles["panelForm"]} onSubmit={(event) => void createExport(event)}>
            <label>
              <span>Report type</span>
              <select value={exportType} onChange={(event) => setExportType(event.target.value)}>
                <option value="summary">Summary and buckets</option>
                <option value="payments">Payment ledger</option>
                <option value="memberships">Membership ledger</option>
                <option value="recurring_customers">Recurring customers</option>
                <option value="reconciliation">Reconciliation exceptions</option>
              </select>
            </label>
            <label className={styles["full"]}>
              <span>Business reason</span>
              <textarea
                value={exportReason}
                onChange={(event) => setExportReason(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={busy !== null}>
              Generate secure CSV
            </button>
          </form>
          <div className={styles["tableWrap"]}>
            <table>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Generated</th>
                  <th>Rows</th>
                  <th>Schema</th>
                  <th>Requested by</th>
                  <th>Expires</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {exports.exports.map((item) => (
                  <tr key={String(item["id"])}>
                    <td>{text(item["reportType"])}</td>
                    <td>{dateTime(item["generatedAt"])}</td>
                    <td>{text(item["rowCount"])}</td>
                    <td>{text(item["schemaVersion"])}</td>
                    <td>{text(item["requestedBy"])}</td>
                    <td>{dateTime(item["expiresAt"])}</td>
                    <td>
                      <a
                        className={styles["download"]}
                        href={`/api/v1/admin/reports/premium/exports/${String(item["id"])}/download`}
                      >
                        Download CSV
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && ledger && !["summary", "plans", "exports"].includes(tab) ? (
        <div className={styles["pagination"]}>
          <span>
            Showing {ledger.total === 0 ? 0 : ledger.offset + 1}–
            {Math.min(ledger.offset + ledger.limit, ledger.total)} of {ledger.total}
          </span>
          <div>
            <button
              type="button"
              className={styles["secondary"]}
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous
            </button>
            <button
              type="button"
              className={styles["secondary"]}
              disabled={offset + 50 >= ledger.total}
              onClick={() => setOffset(offset + 50)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
