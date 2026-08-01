"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./admin.module.css";

type ContentEntry = Readonly<{
  id: string;
  kind: "guide" | "question" | "glossary" | "comparison";
  slug: string;
  locale: "en" | "ur";
  title: string;
  summary: string;
  directAnswer: string | null;
  body: Readonly<Record<string, unknown>>;
  sourceReferences: readonly Readonly<Record<string, unknown>>[];
  status:
    | "draft"
    | "in_review"
    | "approved"
    | "scheduled"
    | "published"
    | "superseded"
    | "archived";
  version: number;
  reviewerName: string;
  updatedAt: string;
}>;

type ModerationReport = Readonly<{
  id: string;
  targetType: string;
  targetId: string;
  category: string;
  description: string;
  status: string;
  createdAt: string;
}>;

type AuditEvent = Readonly<{
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  result: string;
  reason: string | null;
  correlationId: string;
  releaseSha: string;
  createdAt: string;
}>;

type ExportManifest = Readonly<{
  id: string;
  exportType: string;
  status: string;
  rowCount: number;
  contentDigest: string;
  expiresAt: string;
  note: string;
}>;

const roles = [
  "content_editor",
  "content_reviewer",
  "publisher",
  "learner_support",
  "payment_operator",
  "analyst",
  "security_admin",
] as const;

const exportTypes = ["analytics", "payments", "content", "support", "audit"] as const;

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

async function adminRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...(init.headers ?? {}) }
      : init?.headers,
  });
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  } catch {
    // The bounded fallback remains safer than exposing a provider or stack response.
  }
  return fallback;
}

export function GovernanceConsole() {
  const [entries, setEntries] = useState<readonly ContentEntry[]>([]);
  const [reports, setReports] = useState<readonly ModerationReport[]>([]);
  const [auditEvents, setAuditEvents] = useState<readonly AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ContentEntry["kind"]>("guide");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [directAnswer, setDirectAnswer] = useState("");
  const [bodyJson, setBodyJson] = useState('{"sections":[]}');
  const [sourceTitle, setSourceTitle] = useState("");

  const [roleUserId, setRoleUserId] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>("content_editor");
  const [roleReason, setRoleReason] = useState("");
  const [roleExpiry, setRoleExpiry] = useState("");

  const [auditAction, setAuditAction] = useState("");
  const [auditResult, setAuditResult] = useState("");
  const [exportType, setExportType] = useState<(typeof exportTypes)[number]>("content");
  const [exportReason, setExportReason] = useState("");
  const [exportManifest, setExportManifest] = useState<ExportManifest | null>(null);

  const canCreate = useMemo(
    () =>
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
      title.trim().length >= 3 &&
      summary.trim().length >= 10 &&
      sourceTitle.trim().length >= 3,
    [slug, sourceTitle, summary, title],
  );

  const loadContent = useCallback(async () => {
    const response = await adminRequest("/admin/content?limit=100");
    if (response.status === 403) return [];
    if (!response.ok)
      throw new Error(await responseMessage(response, "Content entries could not be loaded."));
    return ((await response.json()) as { entries: readonly ContentEntry[] }).entries;
  }, []);

  const loadReports = useCallback(async () => {
    const response = await adminRequest("/admin/moderation/reports?status=open&limit=100");
    if (response.status === 403) return [];
    if (!response.ok)
      throw new Error(await responseMessage(response, "Moderation reports could not be loaded."));
    return ((await response.json()) as { reports: readonly ModerationReport[] }).reports;
  }, []);

  const loadAudit = useCallback(async (action = "", result = "") => {
    const query = new URLSearchParams({ limit: "100" });
    if (action.trim()) query.set("action", action.trim());
    if (result) query.set("result", result);
    const response = await adminRequest(`/admin/audit?${query.toString()}`);
    if (response.status === 403) return [];
    if (!response.ok)
      throw new Error(await responseMessage(response, "Audit evidence could not be loaded."));
    return ((await response.json()) as { events: readonly AuditEvent[] }).events;
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    const [contentResult, reportResult, auditResultValue] = await Promise.allSettled([
      loadContent(),
      loadReports(),
      loadAudit(auditAction, auditResult),
    ]);
    if (contentResult.status === "fulfilled") setEntries(contentResult.value);
    if (reportResult.status === "fulfilled") setReports(reportResult.value);
    if (auditResultValue.status === "fulfilled") setAuditEvents(auditResultValue.value);
    const rejection = [contentResult, reportResult, auditResultValue].find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (rejection)
      setError(
        rejection.reason instanceof Error
          ? rejection.reason.message
          : "Admin data could not be loaded.",
      );
    setLoading(false);
  }, [auditAction, auditResult, loadAudit, loadContent, loadReports]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createContent(): Promise<void> {
    setBusy("create-content");
    setError(null);
    try {
      const parsedBody: unknown = JSON.parse(bodyJson);
      if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
        throw new Error("Content body must be a JSON object.");
      }
      const response = await adminRequest("/admin/content", {
        method: "POST",
        body: JSON.stringify({
          kind,
          slug,
          locale: "en",
          title: title.trim(),
          summary: summary.trim(),
          directAnswer: directAnswer.trim() || null,
          body: parsedBody,
          sourceReferences: [
            {
              title: sourceTitle.trim(),
              publisher: "SkillUp Editorial Team",
              retrievedAt: new Date().toISOString(),
            },
          ],
        }),
      });
      if (!response.ok)
        throw new Error(await responseMessage(response, "Content could not be created."));
      setSlug("");
      setTitle("");
      setSummary("");
      setDirectAnswer("");
      setBodyJson('{"sections":[]}');
      setSourceTitle("");
      setMessage("Draft content version created.");
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Content could not be created.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function transitionContent(
    entry: ContentEntry,
    action: "submit" | "approve" | "publish" | "archive",
  ): Promise<void> {
    const key = `${entry.id}:${action}`;
    setBusy(key);
    setError(null);
    try {
      const response = await adminRequest(`/admin/content/${entry.id}/${action}`, {
        method: "POST",
        body: "{}",
      });
      if (!response.ok)
        throw new Error(await responseMessage(response, `Content could not be ${action}ed.`));
      setMessage(`${entry.title}: ${action} completed.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Content transition failed.");
    } finally {
      setBusy(null);
    }
  }

  async function resolveReport(
    report: ModerationReport,
    disposition: "resolved" | "dismissed",
  ): Promise<void> {
    const key = `${report.id}:${disposition}`;
    setBusy(key);
    setError(null);
    const response = await adminRequest(`/admin/moderation/reports/${report.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        disposition,
        action: disposition === "resolved" ? "resolve" : "dismiss",
        reason:
          disposition === "resolved"
            ? "Reviewed and resolved through the admin console."
            : "Reviewed and dismissed with no corrective action required.",
        metadata: { surface: "governance_console" },
      }),
    });
    if (!response.ok) {
      setError(await responseMessage(response, "The moderation report could not be resolved."));
    } else {
      setMessage(`Moderation report ${disposition}.`);
      await refresh();
    }
    setBusy(null);
  }

  async function changeRole(mode: "grant" | "revoke"): Promise<void> {
    const key = `${mode}-role`;
    setBusy(key);
    setError(null);
    const path = `/admin/access/${roleUserId.trim()}/roles${mode === "revoke" ? `/${role}` : ""}`;
    const response = await adminRequest(path, {
      method: mode === "grant" ? "POST" : "DELETE",
      body: JSON.stringify(
        mode === "grant"
          ? {
              role,
              reason: roleReason.trim(),
              expiresAt: roleExpiry ? new Date(roleExpiry).toISOString() : null,
            }
          : { reason: roleReason.trim() },
      ),
    });
    if (!response.ok) {
      setError(
        await responseMessage(
          response,
          `The role could not be ${mode === "grant" ? "granted" : "revoked"}.`,
        ),
      );
    } else {
      setMessage(`Role ${role} ${mode === "grant" ? "granted" : "revoked"}.`);
      setRoleReason("");
    }
    setBusy(null);
  }

  async function createExport(): Promise<void> {
    setBusy("export");
    setError(null);
    const response = await adminRequest("/admin/exports", {
      method: "POST",
      body: JSON.stringify({ exportType, filters: {}, reason: exportReason.trim() }),
    });
    if (!response.ok) {
      setError(await responseMessage(response, "The export manifest could not be created."));
    } else {
      setExportManifest(((await response.json()) as { export: ExportManifest }).export);
      setMessage("Audited export manifest created.");
    }
    setBusy(null);
  }

  if (loading)
    return <section className={styles["section"]}>Loading governance operations…</section>;

  return (
    <>
      {message ? <p className={styles["message"]}>{message}</p> : null}
      {error ? (
        <p className={`${styles["message"]} ${styles["error"]}`} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles["section"]} aria-labelledby="content-operations-title">
        <h2 id="content-operations-title">Content versions and publication</h2>
        <form
          className={styles["form"]}
          onSubmit={(event) => {
            event.preventDefault();
            void createContent();
          }}
        >
          <label className={styles["field"]}>
            <span className={styles["label"]}>Content family</span>
            <select
              className={styles["select"]}
              value={kind}
              onChange={(event) => setKind(event.currentTarget.value as ContentEntry["kind"])}
            >
              <option value="guide">Guide</option>
              <option value="question">Question</option>
              <option value="glossary">Glossary</option>
              <option value="comparison">Comparison</option>
            </select>
          </label>
          <label className={styles["field"]}>
            <span className={styles["label"]}>Stable slug</span>
            <input
              className={styles["input"]}
              value={slug}
              onChange={(event) => setSlug(event.currentTarget.value)}
              placeholder="evidence-based-answer"
            />
          </label>
          <label className={`${styles["field"]} ${styles["fieldFull"]}`}>
            <span className={styles["label"]}>Title</span>
            <input
              className={styles["input"]}
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          <label className={`${styles["field"]} ${styles["fieldFull"]}`}>
            <span className={styles["label"]}>Summary</span>
            <textarea
              className={styles["textarea"]}
              value={summary}
              onChange={(event) => setSummary(event.currentTarget.value)}
            />
          </label>
          <label className={`${styles["field"]} ${styles["fieldFull"]}`}>
            <span className={styles["label"]}>Direct answer</span>
            <textarea
              className={styles["textarea"]}
              value={directAnswer}
              onChange={(event) => setDirectAnswer(event.currentTarget.value)}
            />
          </label>
          <label className={`${styles["field"]} ${styles["fieldFull"]}`}>
            <span className={styles["label"]}>Body JSON</span>
            <textarea
              className={`${styles["textarea"]} ${styles["code"]}`}
              value={bodyJson}
              onChange={(event) => setBodyJson(event.currentTarget.value)}
            />
          </label>
          <label className={`${styles["field"]} ${styles["fieldFull"]}`}>
            <span className={styles["label"]}>Reviewed source title</span>
            <input
              className={styles["input"]}
              value={sourceTitle}
              onChange={(event) => setSourceTitle(event.currentTarget.value)}
            />
          </label>
          <button
            className={styles["button"]}
            type="submit"
            disabled={!canCreate || busy === "create-content"}
          >
            Create draft version
          </button>
        </form>

        <ul className={styles["list"]}>
          {entries.map((entry) => (
            <li className={styles["item"]} key={entry.id}>
              <div className={styles["itemHeader"]}>
                <div>
                  <h3>{entry.title}</h3>
                  <p className={styles["meta"]}>
                    {entry.kind} · {entry.locale} · version {entry.version} · {entry.status} ·
                    updated {dateLabel(entry.updatedAt)}
                  </p>
                </div>
              </div>
              <p>{entry.summary}</p>
              <div className={styles["actions"]}>
                {entry.status === "draft" ? (
                  <button
                    className={styles["button"]}
                    type="button"
                    disabled={busy === `${entry.id}:submit`}
                    onClick={() => void transitionContent(entry, "submit")}
                  >
                    Submit for review
                  </button>
                ) : null}
                {entry.status === "in_review" ? (
                  <button
                    className={styles["button"]}
                    type="button"
                    disabled={busy === `${entry.id}:approve`}
                    onClick={() => void transitionContent(entry, "approve")}
                  >
                    Approve
                  </button>
                ) : null}
                {entry.status === "approved" || entry.status === "scheduled" ? (
                  <button
                    className={styles["button"]}
                    type="button"
                    disabled={busy === `${entry.id}:publish`}
                    onClick={() => void transitionContent(entry, "publish")}
                  >
                    Publish
                  </button>
                ) : null}
                {!(["archived", "superseded"] as const).includes(
                  entry.status as "archived" | "superseded",
                ) ? (
                  <button
                    className={`${styles["button"]} ${styles["danger"]}`}
                    type="button"
                    disabled={busy === `${entry.id}:archive`}
                    onClick={() => void transitionContent(entry, "archive")}
                  >
                    Archive
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles["section"]} aria-labelledby="moderation-title">
        <h2 id="moderation-title">Open content and sharing reports</h2>
        <ul className={styles["list"]}>
          {reports.length === 0 ? (
            <li className={styles["item"]}>No open reports available to this role.</li>
          ) : (
            reports.map((report) => (
              <li className={styles["item"]} key={report.id}>
                <h3>{report.category}</h3>
                <p className={styles["meta"]}>
                  {report.targetType} · {report.targetId} · {dateLabel(report.createdAt)}
                </p>
                <p>{report.description}</p>
                <div className={styles["actions"]}>
                  <button
                    className={styles["button"]}
                    type="button"
                    disabled={busy === `${report.id}:resolved`}
                    onClick={() => void resolveReport(report, "resolved")}
                  >
                    Resolve
                  </button>
                  <button
                    className={`${styles["button"]} ${styles["secondary"]}`}
                    type="button"
                    disabled={busy === `${report.id}:dismissed`}
                    onClick={() => void resolveReport(report, "dismissed")}
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className={styles["section"]} aria-labelledby="access-title">
        <h2 id="access-title">Role assignment and immediate revocation</h2>
        <div className={styles["form"]}>
          <label className={styles["field"]}>
            <span className={styles["label"]}>Learner/admin user UUID</span>
            <input
              className={styles["input"]}
              value={roleUserId}
              onChange={(event) => setRoleUserId(event.currentTarget.value)}
            />
          </label>
          <label className={styles["field"]}>
            <span className={styles["label"]}>Role</span>
            <select
              className={styles["select"]}
              value={role}
              onChange={(event) => setRole(event.currentTarget.value as typeof role)}
            >
              {roles.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className={`${styles["field"]} ${styles["fieldFull"]}`}>
            <span className={styles["label"]}>Reason</span>
            <input
              className={styles["input"]}
              value={roleReason}
              onChange={(event) => setRoleReason(event.currentTarget.value)}
            />
          </label>
          <label className={styles["field"]}>
            <span className={styles["label"]}>Optional expiry</span>
            <input
              className={styles["input"]}
              type="datetime-local"
              value={roleExpiry}
              onChange={(event) => setRoleExpiry(event.currentTarget.value)}
            />
          </label>
          <div className={styles["actions"]}>
            <button
              className={styles["button"]}
              type="button"
              disabled={
                roleUserId.length !== 36 || roleReason.trim().length < 3 || busy === "grant-role"
              }
              onClick={() => void changeRole("grant")}
            >
              Grant role
            </button>
            <button
              className={`${styles["button"]} ${styles["danger"]}`}
              type="button"
              disabled={
                roleUserId.length !== 36 || roleReason.trim().length < 3 || busy === "revoke-role"
              }
              onClick={() => void changeRole("revoke")}
            >
              Revoke role
            </button>
          </div>
        </div>
      </section>

      <section className={styles["section"]} aria-labelledby="audit-title">
        <h2 id="audit-title">Privileged audit evidence</h2>
        <div className={styles["form"]}>
          <label className={styles["field"]}>
            <span className={styles["label"]}>Exact action</span>
            <input
              className={styles["input"]}
              value={auditAction}
              onChange={(event) => setAuditAction(event.currentTarget.value)}
              placeholder="admin.role.grant"
            />
          </label>
          <label className={styles["field"]}>
            <span className={styles["label"]}>Result</span>
            <select
              className={styles["select"]}
              value={auditResult}
              onChange={(event) => setAuditResult(event.currentTarget.value)}
            >
              <option value="">Any</option>
              <option value="allowed">Allowed</option>
              <option value="denied">Denied</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <button className={styles["button"]} type="button" onClick={() => void refresh()}>
            Search audit
          </button>
        </div>
        <ul className={styles["list"]}>
          {auditEvents.length === 0 ? (
            <li className={styles["item"]}>No audit events available to this role or filter.</li>
          ) : (
            auditEvents.map((event) => (
              <li className={styles["item"]} key={event.id}>
                <h3>{event.action}</h3>
                <p className={styles["meta"]}>
                  {event.result} · {event.actorRole ?? "system"} · {dateLabel(event.createdAt)} ·
                  release {event.releaseSha}
                </p>
                <p>{event.reason ?? "No reason recorded."}</p>
                <p className={styles["reference"]}>
                  {event.targetType}:{event.targetId ?? "none"} · {event.correlationId}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className={styles["section"]} aria-labelledby="export-title">
        <h2 id="export-title">Audited export manifest</h2>
        <div className={styles["form"]}>
          <label className={styles["field"]}>
            <span className={styles["label"]}>Export class</span>
            <select
              className={styles["select"]}
              value={exportType}
              onChange={(event) => setExportType(event.currentTarget.value as typeof exportType)}
            >
              {exportTypes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className={`${styles["field"]} ${styles["fieldFull"]}`}>
            <span className={styles["label"]}>Purpose</span>
            <input
              className={styles["input"]}
              value={exportReason}
              onChange={(event) => setExportReason(event.currentTarget.value)}
            />
          </label>
          <button
            className={styles["button"]}
            type="button"
            disabled={exportReason.trim().length < 3 || busy === "export"}
            onClick={() => void createExport()}
          >
            Create manifest
          </button>
        </div>
        {exportManifest ? (
          <pre className={styles["code"]}>{JSON.stringify(exportManifest, null, 2)}</pre>
        ) : null}
      </section>
    </>
  );
}
