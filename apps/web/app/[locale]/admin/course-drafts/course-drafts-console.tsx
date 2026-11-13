"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "../admin.module.css";

type DraftCourse = Readonly<{
  slug: string;
  title: string;
  status: "draft" | "in_review";
  moduleCount: number;
  levelCount: number;
  challengeCount: number;
  draftChallenges: number;
  reviewStatus: "not_approved";
}>;

function parseDrafts(value: unknown): readonly DraftCourse[] {
  if (!value || typeof value !== "object" || !("courses" in value)) return [];
  const raw = (value as { courses?: unknown }).courses;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is DraftCourse => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return (
      typeof record["slug"] === "string" &&
      typeof record["title"] === "string" &&
      ["draft", "in_review"].includes(String(record["status"])) &&
      ["moduleCount", "levelCount", "challengeCount", "draftChallenges"].every(
        (key) => Number.isInteger(record[key]) && Number(record[key]) >= 0,
      ) &&
      record["reviewStatus"] === "not_approved"
    );
  });
}

export function CourseDraftsConsole() {
  const [items, setItems] = useState<readonly DraftCourse[]>([]);
  const [message, setMessage] = useState("Loading private draft course status…");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const reload = useCallback(() => setRefresh((current) => current + 1), []);

  async function downloadReviewerPacket(slug: string): Promise<void> {
    setDownloading(slug);
    try {
      const response = await fetch(
        "/api/v1/admin/course-drafts/" + encodeURIComponent(slug) + "/review-packet",
        { credentials: "same-origin", cache: "no-store" },
      );
      if (response.status === 401 || response.status === 403) {
        setMessage("A content-reviewer role is required to inspect private exercise answer keys.");
        return;
      }
      if (!response.ok) throw new Error("The reviewer packet could not be generated.");
      const packet = (await response.json()) as unknown;
      const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "skillup-" + slug + "-unapproved-review-packet.json";
      link.click();
      window.requestAnimationFrame(() => URL.revokeObjectURL(url));
      setMessage("Private reviewer packet exported. This does not approve or publish the course.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reviewer export failed.");
    } finally {
      setDownloading(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/v1/admin/course-drafts?reload=${refresh}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          setMessage("Your account cannot view this private editorial queue.");
          setItems([]);
          return;
        }
        if (!response.ok) throw new Error("The editorial queue is temporarily unavailable.");
        setItems(parseDrafts(await response.json()));
        setMessage("Draft records are private and cannot be published from this view.");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setItems([]);
        setMessage(
          error instanceof Error ? error.message : "The editorial queue could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);

  return (
    <section className={styles["section"]} aria-labelledby="draft-courses-heading">
      <h2 id="draft-courses-heading">Unpublished course inventory</h2>
      <p><a href="/en/admin/course-editorial">Open the independent human-review and release console</a></p>
      <p role="status">{message}</p>
      <button className={styles["button"]} type="button" onClick={reload} disabled={loading}>
        {loading ? "Checking…" : "Refresh draft status"}
      </button>
      {!loading && items.length === 0 ? (
        <p>No course drafts are available to this account.</p>
      ) : null}
      <ul className={styles["list"]}>
        {items.map((course) => (
          <li className={styles["item"]} key={course.slug}>
            <div className={styles["itemHeader"]}>
              <h3>{course.title}</h3>
              <span className={styles["meta"]}>Review required — {course.status}</span>
            </div>
            <p className={styles["meta"]}>
              {course.moduleCount} modules · {course.levelCount} draft levels ·{" "}
              {course.challengeCount} exercises ({course.draftChallenges} in draft)
            </p>
            <p>
              Subject review, language/accessibility review and publisher authorization have not
              been completed. This course is not part of the published Premium catalogue.
            </p>
            <button
              type="button"
              className={styles["button"]}
              onClick={() => void downloadReviewerPacket(course.slug)}
              disabled={downloading !== null}
            >
              {downloading === course.slug
                ? "Preparing private packet…"
                : "Export reviewer-only draft packet"}
            </button>
            <p className={styles["meta"]}>
              Restricted to content reviewers. The JSON includes confidential answer keys; never
              publish, share publicly or use as evidence of completed human review.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
