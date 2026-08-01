"use client";

import { useState } from "react";

import styles from "./discovery.module.css";

const categories = [
  ["incorrect", "Incorrect information"],
  ["unsafe", "Unsafe guidance"],
  ["outdated", "Outdated information"],
  ["privacy", "Privacy concern"],
  ["copyright", "Copyright concern"],
  ["other", "Other concern"],
] as const;

export function PublicContentReport({ targetId }: Readonly<{ targetId: string }>) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof categories)[number][0]>("incorrect");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(): Promise<void> {
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/public/content/reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "public_content",
          targetId,
          category,
          description: description.trim(),
        }),
      });
      if (!response.ok) throw new Error("Report submission failed.");
      setMessage("Your report was recorded for moderated review.");
      setDescription("");
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles["contentCard"]} aria-labelledby={`report-${targetId}`}>
      <h2 id={`report-${targetId}`}>Report a content concern</h2>
      <p>
        Report inaccurate, unsafe, outdated, private or copyrighted material. Do not include
        passwords, verification codes or sensitive personal information.
      </p>
      {!open ? (
        <button className={styles["secondaryLink"]} type="button" onClick={() => setOpen(true)}>
          Open report form
        </button>
      ) : (
        <div>
          <label>
            Concern category
            <select value={category} onChange={(event) => setCategory(event.currentTarget.value as typeof category)}>
              {categories.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            What should the reviewer check?
            <textarea
              value={description}
              minLength={10}
              maxLength={2000}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </label>
          <div className={styles["cardLinks"]}>
            <button
              className={styles["primaryLink"]}
              type="button"
              disabled={submitting || description.trim().length < 10}
              onClick={() => void submit()}
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
            <button className={styles["secondaryLink"]} type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message ? <p aria-live="polite">{message}</p> : null}
    </section>
  );
}
