"use client";

import { useState } from "react";

import styles from "../admin.module.css";

type Review = Readonly<{
  kind: "subject" | "accessibility";
  decision: "approve" | "request_changes";
  reviewerId: string;
  reason: string;
  at: string;
}>;
type Submission = Readonly<{
  id: string;
  status: string;
  contentDigest: string;
  submittedBy: string;
  submittedAt: string;
  publishedAt: string | null;
  counts: { modules: number; levels: number; challenges: number };
  reviews: readonly Review[];
  events: readonly { id: number; action: string; actorId: string; reason: string; at: string }[];
}>;

const subjectChecks = [
  ["facts_verified", "Spreadsheet and course facts independently verified"],
  ["answer_keys_verified", "Every evaluation key and distractor checked"],
  ["source_rights_verified", "Sources, originality and rights verified"],
  ["assessments_verified", "Baseline/end assessments checked against learning outcomes"],
] as const;
const accessibilityChecks = [
  ["language_checked", "Clarity and language checked by a human"],
  ["keyboard_mobile_checked", "Keyboard and mobile interactions checked"],
  ["accessibility_checked", "Screen reader, contrast and alternatives checked"],
  ["capstone_verified", "Practical project assets and rubric independently verified"],
] as const;
type Kind = "subject" | "accessibility";

export function CourseEditorialConsole() {
  const [slug, setSlug] = useState("");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<Kind>("subject");
  const [decision, setDecision] = useState<"approve" | "request_changes">("approve");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [evidence, setEvidence] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submissions, setSubmissions] = useState<readonly Submission[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState(
    "Choose a course slug to inspect its signed editorial history.",
  );
  const [busy, setBusy] = useState(false);

  async function loadHistory(courseSlug = slug): Promise<void> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(courseSlug)) {
      setMessage("Use a valid course slug (lowercase words and hyphens).");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        "/api/v1/admin/course-drafts/" + encodeURIComponent(courseSlug) + "/editorial",
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) throw new Error("Editorial history unavailable (" + response.status + ").");
      const data = (await response.json()) as { submissions?: Submission[] };
      const history = Array.isArray(data.submissions) ? data.submissions : [];
      setSubmissions(history);
      setSelected(history[0]?.id ?? "");
      setMessage(
        history.length ? "Verified server-side editorial history." : "No signed submission yet.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "History request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function act(
    action: "submit" | "review" | "publish" | "withdraw" | "rollback",
  ): Promise<void> {
    const submission = submissions.find((entry) => entry.id === selected);
    if (action !== "submit" && !submission) {
      setMessage("Select a signed submission before taking an action.");
      return;
    }
    if (reason.trim().length < 12) {
      setMessage("Enter a substantive reason (at least 12 characters).");
      return;
    }
    if ((action === "publish" || action === "withdraw" || action === "rollback") && !confirmed) {
      setMessage("Confirm the release action explicitly before proceeding.");
      return;
    }
    const required = kind === "subject" ? subjectChecks : accessibilityChecks;
    if (action === "review" && decision === "approve" && required.some(([key]) => !checks[key])) {
      setMessage("Tick every independently verified item for this review category.");
      return;
    }
    const url =
      action === "submit"
        ? "/api/v1/admin/course-drafts/" + encodeURIComponent(slug) + "/submit"
        : "/api/v1/admin/course-submissions/" + encodeURIComponent(selected) + "/" + action;
    const payload: Record<string, unknown> = { reason: reason.trim() };
    if (action === "review") {
      payload["kind"] = kind;
      payload["decision"] = decision;
      payload["checklist"] = Object.fromEntries(
        required.map(([key]) => [key, checks[key] === true]),
      );
    }
    if (action === "publish") payload["stagingEvidenceUrl"] = evidence.trim();
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        message?: string;
        submission?: { id?: string; status?: string };
      };
      if (!response.ok)
        throw new Error(result.message ?? "Action denied (" + response.status + ").");
      setMessage(
        "Server confirmed: " + action + " (" + (result.submission?.status ?? "recorded") + ").",
      );
      setConfirmed(false);
      setChecks({});
      setReason("");
      setBusy(false);
      await loadHistory(slug);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The action was not recorded.");
      setBusy(false);
    }
  }

  const chosen = submissions.find((entry) => entry.id === selected);
  const required = kind === "subject" ? subjectChecks : accessibilityChecks;

  return (
    <section className={styles["section"]} aria-labelledby="course-editorial-heading">
      <h2 id="course-editorial-heading">Human approvals and course release control</h2>
      <p role="status">{message}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void loadHistory();
        }}
      >
        <label htmlFor="editorial-slug">Course slug</label>
        <input
          id="editorial-slug"
          value={slug}
          onChange={(event) => setSlug(event.target.value.trim().toLowerCase())}
          placeholder="excel-google-sheets-work"
          maxLength={120}
        />
        <button className={styles["button"]} type="submit" disabled={busy}>
          Load private editorial history
        </button>
      </form>
      <p>
        Drafts require four different human identities: editor, subject reviewer, accessibility
        reviewer and publisher. Nobody can approve their own submission. All actions are audited.
      </p>
      <label htmlFor="editorial-submission">Frozen submission version</label>
      <select
        id="editorial-submission"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        disabled={busy || submissions.length === 0}
      >
        <option value="">Choose a submission</option>
        {submissions.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.status} · {entry.contentDigest.slice(0, 12)} · {entry.id.slice(0, 8)}
          </option>
        ))}
      </select>
      {chosen ? (
        <div>
          <h3>Immutable content version</h3>
          <p>
            {chosen.status} · {chosen.counts.modules} modules · {chosen.counts.levels} levels ·{" "}
            {chosen.counts.challenges} exercises
          </p>
          <p>
            Fingerprint: <code>{chosen.contentDigest}</code>
          </p>
          <p>
            Submitted by account {chosen.submittedBy} at {chosen.submittedAt}.
          </p>
          <ul className={styles["list"]}>
            {chosen.reviews.map((item) => (
              <li key={item.kind} className={styles["item"]}>
                {item.kind}: {item.decision} by account {item.reviewerId} · {item.reason}
              </li>
            ))}
          </ul>
          <details>
            <summary>Audit history</summary>
            <ul>
              {chosen.events.map((item) => (
                <li key={item.id}>
                  {item.at} · {item.action} · account {item.actorId} · {item.reason}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
      <label htmlFor="editorial-reason">Reason and human review notes</label>
      <textarea
        id="editorial-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        maxLength={1500}
        placeholder="Describe your independently verified changes or publication decision."
      />
      <button
        className={styles["button"]}
        type="button"
        onClick={() => void act("submit")}
        disabled={busy}
      >
        Editor: submit complete draft
      </button>
      <fieldset>
        <legend>Independent reviewer verification</legend>
        <label htmlFor="review-kind">Review discipline</label>
        <select
          id="review-kind"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as Kind);
            setChecks({});
          }}
        >
          <option value="subject">Subject accuracy and rights</option>
          <option value="accessibility">Language, accessibility and practical projects</option>
        </select>
        <label htmlFor="review-decision">Decision</label>
        <select
          id="review-decision"
          value={decision}
          onChange={(event) => setDecision(event.target.value as "approve" | "request_changes")}
        >
          <option value="approve">Approve after checking every item</option>
          <option value="request_changes">Request changes / reject</option>
        </select>
        {required.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={checks[key] === true}
              onChange={(event) =>
                setChecks((previous) => ({ ...previous, [key]: event.target.checked }))
              }
            />
            {label}
          </label>
        ))}
        <button
          className={styles["button"]}
          type="button"
          disabled={busy || !chosen || chosen.status !== "submitted"}
          onClick={() => void act("review")}
        >
          Reviewer: record my signed decision
        </button>
      </fieldset>
      <fieldset>
        <legend>Publisher release and rollback</legend>
        <label htmlFor="course-qa-evidence">Course-specific staging QA evidence (HTTPS URL)</label>
        <input
          id="course-qa-evidence"
          type="url"
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          maxLength={500}
          placeholder="https://github.com/SkillStep/skillup-platform/actions/runs/..."
        />
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I am the authorized publisher and have checked this exact version, its human approvals, QA
          evidence and impact on existing learners.
        </label>
        <p>
          Publisher actions are disabled server-side unless AIFS_COURSE_PUBLISH_ENABLED=yes has been
          explicitly authorized in the target environment. No automatic publication.
        </p>
        <button
          className={styles["button"]}
          type="button"
          disabled={busy || !confirmed || chosen?.status !== "approved"}
          onClick={() => void act("publish")}
        >
          Publisher: publish approved version
        </button>
        <button
          className={styles["button"]}
          type="button"
          disabled={busy || !confirmed || chosen?.status !== "published"}
          onClick={() => void act("rollback")}
        >
          Restore previously approved release
        </button>
        <button
          className={styles["button"]}
          type="button"
          disabled={busy || !confirmed || chosen?.status !== "published"}
          onClick={() => void act("withdraw")}
        >
          Withdraw published course from catalogue
        </button>
      </fieldset>
    </section>
  );
}
