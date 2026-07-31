"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { withReturnTo } from "../../../lib/return-to";
import styles from "./admin.module.css";

type AdminIdentity = Readonly<{
  userId: string;
  roles: readonly string[];
  capabilities: readonly string[];
}>;

type Artifact = Readonly<{
  id: string;
  artifactType: string;
  locale: string;
  qualityScore: number;
  qualityThreshold: number;
  status: string;
  validationReport: Readonly<Record<string, unknown>>;
  sourceReferences: readonly Record<string, unknown>[];
  originalContent: Readonly<Record<string, unknown>>;
  editedContent: Readonly<Record<string, unknown>> | null;
  task: string;
  promptVersion: string;
  provider: string | null;
  model: string | null;
  correlationId: string;
}>;

type ReconciliationCase = Readonly<{
  id: string;
  status: string;
  mismatchKind: string;
  providerEvidence: Readonly<Record<string, unknown>>;
  internalEvidence: Readonly<Record<string, unknown>>;
  orderId: string;
  merchantReference: string;
  providerReference: string | null;
  orderStatus: string;
  amountMinor: number;
  currency: string;
}>;

type Metrics = Readonly<Record<string, string | number | null>>;

type ErrorPayload = Readonly<{ message?: string }>;

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorPayload;
    if (body.message) return body.message;
  } catch {
    // Non-JSON failures receive a safe generic message.
  }
  return "The requested operation could not be completed.";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as T;
}

function hasCapability(admin: AdminIdentity | null, capability: string): boolean {
  return admin?.capabilities.includes(capability) ?? false;
}

function metricLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function OperationsConsole() {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({});
  const [artifacts, setArtifacts] = useState<readonly Artifact[]>([]);
  const [cases, setCases] = useState<readonly ReconciliationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [publicationTargets, setPublicationTargets] = useState<Record<string, string>>({});
  const [reconciliationReasons, setReconciliationReasons] = useState<Record<string, string>>({});
  const [supportUserId, setSupportUserId] = useState("");
  const [supportResult, setSupportResult] = useState<Record<string, unknown> | null>(null);

  const loadConsole = useCallback(async (signal: AbortSignal | null = null) => {
    setError(null);
    try {
      const sessionResponse = await fetch("/api/v1/admin/session", {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (sessionResponse.status === 401) {
        window.location.replace(withReturnTo("/en/sign-in", "/en/admin"));
        return;
      }
      if (sessionResponse.status === 403) {
        setError("Your account does not have administrative access.");
        return;
      }
      if (!sessionResponse.ok) throw new Error(await errorMessage(sessionResponse));
      const session = (await sessionResponse.json()) as Readonly<{ admin: AdminIdentity }>;
      setAdmin(session.admin);

      const requests: Promise<void>[] = [];
      if (session.admin.capabilities.includes("metrics.read")) {
        requests.push(
          requestJson<Readonly<{ metrics: Metrics }>>("/api/v1/admin/metrics", { signal }).then(
            (body) => setMetrics(body.metrics),
          ),
        );
      }
      if (session.admin.capabilities.includes("ai.review")) {
        requests.push(
          requestJson<Readonly<{ artifacts: readonly Artifact[] }>>(
            "/api/v1/admin/ai/artifacts?limit=50",
            { signal },
          ).then((body) => setArtifacts(body.artifacts)),
        );
      }
      if (session.admin.capabilities.includes("payment.read")) {
        requests.push(
          requestJson<Readonly<{ cases: readonly ReconciliationCase[] }>>(
            "/api/v1/admin/reconciliation?status=open&limit=50",
            { signal },
          ).then((body) => setCases(body.cases)),
        );
      }
      await Promise.all(requests);
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
        setError(loadError instanceof Error ? loadError.message : "The console could not load.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadConsole(controller.signal);
    return () => controller.abort();
  }, [loadConsole]);

  async function runOperation(operation: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await operation();
      setMessage(successMessage);
      await loadConsole();
    } catch (operationError) {
      setError(
        operationError instanceof Error ? operationError.message : "The operation failed safely.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createGenerationRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requestedItems = Number(form.get("requestedItems"));
    await runOperation(async () => {
      await requestJson("/api/v1/admin/ai/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: form.get("task"),
          targetType: form.get("targetType"),
          targetId: form.get("targetId") || null,
          locale: form.get("locale"),
          promptVersion: form.get("promptVersion"),
          requestedItems,
        }),
      });
    }, "A bounded AI generation request was queued for worker processing.");
  }

  async function reviewArtifact(artifactId: string, decision: string) {
    const reason = reviewReasons[artifactId]?.trim();
    if (!reason || reason.length < 3) {
      setError("Enter a review reason before recording a decision.");
      return;
    }
    await runOperation(async () => {
      await requestJson(`/api/v1/admin/ai/artifacts/${artifactId}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
    }, `The artifact review decision was recorded as ${decision}.`);
  }

  async function publishArtifact(artifactId: string, targetType: string) {
    const targetVersionId = publicationTargets[artifactId]?.trim();
    const reason = reviewReasons[artifactId]?.trim();
    if (!targetVersionId || !reason) {
      setError("Publishing requires a target version UUID and a reason.");
      return;
    }
    await runOperation(async () => {
      await requestJson(`/api/v1/admin/ai/artifacts/${artifactId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetVersionId, reason }),
      });
    }, "The approved artifact was linked to the specified published content version.");
  }

  async function rollbackArtifact(artifactId: string) {
    const reason = reviewReasons[artifactId]?.trim();
    if (!reason) {
      setError("Rollback requires an explicit reason.");
      return;
    }
    await runOperation(async () => {
      await requestJson(`/api/v1/admin/ai/artifacts/${artifactId}/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    }, "The current AI artifact publication was rolled back without rewriting history.");
  }

  async function resolveCase(caseId: string, disposition: "resolved" | "ignored") {
    const resolution = reconciliationReasons[caseId]?.trim();
    if (!resolution) {
      setError("Reconciliation requires a resolution explanation.");
      return;
    }
    await runOperation(async () => {
      await requestJson(`/api/v1/admin/reconciliation/${caseId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disposition, resolution }),
      });
    }, "The reconciliation case was closed with preserved provider evidence.");
  }

  async function lookupLearner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runOperation(async () => {
      const result = await requestJson<Record<string, unknown>>(
        `/api/v1/admin/learners/${encodeURIComponent(supportUserId)}/support`,
      );
      setSupportResult(result);
    }, "The minimum support timeline was loaded.");
  }

  if (loading) return <p className={styles["message"]}>Loading secure operations console…</p>;

  return (
    <>
      {admin ? (
        <section className={styles["identity"]} aria-label="Effective administrative access">
          <p>
            <strong>Roles:</strong> {admin.roles.join(", ")}
          </p>
          <p>
            <strong>Capabilities:</strong> {admin.capabilities.join(", ")}
          </p>
        </section>
      ) : null}

      {message ? <p className={styles["message"]}>{message}</p> : null}
      {error ? (
        <p className={`${styles["message"]} ${styles["error"]}`} role="alert">
          {error}
        </p>
      ) : null}

      {hasCapability(admin, "metrics.read") ? (
        <section aria-labelledby="metrics-title">
          <h2 id="metrics-title">Operational snapshot</h2>
          <div className={styles["grid"]}>
            {Object.entries(metrics).map(([key, value]) => (
              <article className={styles["metric"]} key={key}>
                <span>{metricLabel(key)}</span>
                <strong>{value === null ? "—" : String(value)}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {hasCapability(admin, "ai.request") ? (
        <section className={styles["section"]} aria-labelledby="generation-title">
          <h2 id="generation-title">Create bounded AI generation request</h2>
          <form
            className={styles["form"]}
            onSubmit={(event) => void createGenerationRequest(event)}
          >
            <label className={styles["field"]}>
              <span className={styles["label"]}>Task</span>
              <select className={styles["select"]} name="task" defaultValue="generate_level">
                <option value="generate_level">Generate level</option>
                <option value="generate_distractors">Generate distractors</option>
                <option value="generate_explanation">Generate explanation</option>
                <option value="summarize_content">Summarize content</option>
                <option value="classify_difficulty">Classify difficulty</option>
                <option value="evaluate_content">Evaluate content</option>
                <option value="translate_content">Translate content</option>
              </select>
            </label>
            <label className={styles["field"]}>
              <span className={styles["label"]}>Target type</span>
              <input className={styles["input"]} name="targetType" defaultValue="level" required />
            </label>
            <label className={styles["field"]}>
              <span className={styles["label"]}>Target ID, when applicable</span>
              <input className={styles["input"]} name="targetId" />
            </label>
            <label className={styles["field"]}>
              <span className={styles["label"]}>Locale</span>
              <select className={styles["select"]} name="locale" defaultValue="en">
                <option value="en">English</option>
                <option value="ur">Urdu</option>
              </select>
            </label>
            <label className={styles["field"]}>
              <span className={styles["label"]}>Prompt version</span>
              <input
                className={styles["input"]}
                name="promptVersion"
                defaultValue="launch-v1"
                required
              />
            </label>
            <label className={styles["field"]}>
              <span className={styles["label"]}>Items, maximum 100</span>
              <input
                className={styles["input"]}
                name="requestedItems"
                type="number"
                min={1}
                max={100}
                defaultValue={1}
                required
              />
            </label>
            <button className={styles["button"]} type="submit" disabled={busy}>
              Queue reviewed draft generation
            </button>
          </form>
        </section>
      ) : null}

      {hasCapability(admin, "ai.review") ? (
        <section className={styles["section"]} aria-labelledby="review-title">
          <h2 id="review-title">AI review and publication queue</h2>
          {artifacts.length === 0 ? (
            <p>No artifacts are waiting in the current queue.</p>
          ) : (
            <ul className={styles["list"]}>
              {artifacts.map((artifact) => (
                <li className={styles["item"]} key={artifact.id}>
                  <div className={styles["itemHeader"]}>
                    <div>
                      <h3>{artifact.artifactType}</h3>
                      <p className={styles["meta"]}>
                        {artifact.status} · score {artifact.qualityScore}/
                        {artifact.qualityThreshold} · {artifact.task} · {artifact.promptVersion}
                      </p>
                    </div>
                    <span>{artifact.locale.toUpperCase()}</span>
                  </div>
                  <pre className={styles["code"]}>
                    {JSON.stringify(artifact.editedContent ?? artifact.originalContent, null, 2)}
                  </pre>
                  <pre className={styles["code"]}>
                    {JSON.stringify(artifact.validationReport, null, 2)}
                  </pre>
                  <label className={`${styles["field"]} ${styles["fieldFull"]}`}>
                    <span className={styles["label"]}>
                      Decision, publication or rollback reason
                    </span>
                    <textarea
                      className={styles["textarea"]}
                      value={reviewReasons[artifact.id] ?? ""}
                      onChange={(event) =>
                        setReviewReasons((current) => ({
                          ...current,
                          [artifact.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className={styles["actions"]}>
                    <button
                      className={styles["button"]}
                      type="button"
                      disabled={busy}
                      onClick={() => void reviewArtifact(artifact.id, "approve")}
                    >
                      Approve
                    </button>
                    <button
                      className={`${styles["button"]} ${styles["secondary"]}`}
                      type="button"
                      disabled={busy}
                      onClick={() => void reviewArtifact(artifact.id, "request_changes")}
                    >
                      Request changes
                    </button>
                    <button
                      className={`${styles["button"]} ${styles["danger"]}`}
                      type="button"
                      disabled={busy}
                      onClick={() => void reviewArtifact(artifact.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                  {artifact.status === "approved" && hasCapability(admin, "ai.publish") ? (
                    <div className={styles["actions"]}>
                      <input
                        className={styles["input"]}
                        aria-label="Published content version UUID"
                        placeholder="Published content version UUID"
                        value={publicationTargets[artifact.id] ?? ""}
                        onChange={(event) =>
                          setPublicationTargets((current) => ({
                            ...current,
                            [artifact.id]: event.target.value,
                          }))
                        }
                      />
                      <button
                        className={styles["button"]}
                        type="button"
                        disabled={busy}
                        onClick={() => void publishArtifact(artifact.id, artifact.artifactType)}
                      >
                        Publish approved version
                      </button>
                    </div>
                  ) : null}
                  {artifact.status === "published" && hasCapability(admin, "content.rollback") ? (
                    <button
                      className={`${styles["button"]} ${styles["danger"]}`}
                      type="button"
                      disabled={busy}
                      onClick={() => void rollbackArtifact(artifact.id)}
                    >
                      Roll back publication
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {hasCapability(admin, "payment.read") ? (
        <section className={styles["section"]} aria-labelledby="reconciliation-title">
          <h2 id="reconciliation-title">Payment reconciliation</h2>
          {cases.length === 0 ? (
            <p>No open payment mismatch is waiting for review.</p>
          ) : (
            <ul className={styles["list"]}>
              {cases.map((item) => (
                <li className={styles["item"]} key={item.id}>
                  <h3>{item.mismatchKind}</h3>
                  <p className={styles["meta"]}>
                    {item.merchantReference} · {item.orderStatus} · {item.amountMinor / 100}{" "}
                    {item.currency}
                  </p>
                  <pre className={styles["code"]}>
                    {JSON.stringify(
                      {
                        provider: item.providerEvidence,
                        internal: item.internalEvidence,
                      },
                      null,
                      2,
                    )}
                  </pre>
                  <textarea
                    className={styles["textarea"]}
                    aria-label="Reconciliation resolution"
                    value={reconciliationReasons[item.id] ?? ""}
                    onChange={(event) =>
                      setReconciliationReasons((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                  {hasCapability(admin, "payment.reconcile") ? (
                    <div className={styles["actions"]}>
                      <button
                        className={styles["button"]}
                        type="button"
                        disabled={busy}
                        onClick={() => void resolveCase(item.id, "resolved")}
                      >
                        Resolve with evidence
                      </button>
                      <button
                        className={`${styles["button"]} ${styles["secondary"]}`}
                        type="button"
                        disabled={busy}
                        onClick={() => void resolveCase(item.id, "ignored")}
                      >
                        Ignore with reason
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {hasCapability(admin, "learner.support.read") ? (
        <section className={styles["section"]} aria-labelledby="support-title">
          <h2 id="support-title">Least-privilege learner support</h2>
          <form className={styles["form"]} onSubmit={(event) => void lookupLearner(event)}>
            <label className={`${styles["field"]} ${styles["fieldFull"]}`}>
              <span className={styles["label"]}>Learner user UUID</span>
              <input
                className={styles["input"]}
                value={supportUserId}
                onChange={(event) => setSupportUserId(event.target.value)}
                required
              />
            </label>
            <button className={styles["button"]} type="submit" disabled={busy}>
              Load minimum support timeline
            </button>
          </form>
          {supportResult ? (
            <pre className={styles["code"]}>{JSON.stringify(supportResult, null, 2)}</pre>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
