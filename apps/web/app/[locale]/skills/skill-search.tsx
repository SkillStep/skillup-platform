"use client";

import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";

import { filterUnpublishedPreviews } from "../../../lib/coming-soon-skills";
import type { PublicSkill } from "../../../lib/public-catalog";
import styles from "../discovery.module.css";
import { MotionReveal } from "../motion-reveal";

export function SkillSearch({ skills }: Readonly<{ skills: readonly PublicSkill[] }>) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("en-US"));
  const previews = useMemo(() => filterUnpublishedPreviews(skills), [skills]);
  const visibleSkills = useMemo(() => {
    if (!deferredQuery) return skills;
    return skills.filter((skill) =>
      [skill.title, skill.summary, ...skill.outcomes]
        .join(" ")
        .toLocaleLowerCase("en-US")
        .includes(deferredQuery),
    );
  }, [deferredQuery, skills]);
  const visiblePreviews = useMemo(() => {
    if (!deferredQuery) return previews;
    return previews.filter((skill) =>
      [skill.title, skill.summary, ...skill.keywords]
        .join(" ")
        .toLocaleLowerCase("en-US")
        .includes(deferredQuery),
    );
  }, [deferredQuery, previews]);

  return (
    <>
      <MotionReveal variant="fade-up" durationMs={650}>
        <search className={styles["searchPanel"]}>
          <label htmlFor={inputId}>Search available and upcoming skills</label>
          <input
            className={styles["searchInput"]}
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Try interview, AI, English or freelancing"
            autoComplete="off"
          />
        </search>
      </MotionReveal>

      <p aria-live="polite" className="visually-hidden">
        {visibleSkills.length + visiblePreviews.length}{" "}
        {visibleSkills.length + visiblePreviews.length === 1 ? "skill" : "skills"} shown.{" "}
        {visibleSkills.length} available now; {visiblePreviews.length} coming soon.
      </p>

      <div className={styles["catalogGrid"]}>
        {visibleSkills.map((skill, index) => (
          <MotionReveal
            key={skill.slug}
            variant="zoom-in"
            delayMs={Math.min(index, 5) * 80}
            durationMs={600}
          >
            <article className={styles["catalogCard"]}>
              <span
                className={`${styles["status"]} ${
                  skill.status === "pilot" ? styles["statusPilot"] : styles["statusPlanned"]
                }`}
              >
                {skill.status === "pilot" ? "Reviewed pilot" : "Reviewed launch path"}
              </span>
              <h2>{skill.title}</h2>
              <p>{skill.summary}</p>
              <p>
                {skill.levelCount ?? 0} published levels · {skill.moduleCount ?? 0} modules
              </p>
              <div className={styles["cardLinks"]}>
                <Link className={styles["primaryLink"]} href={`/en/learn/${skill.levelId}`}>
                  Start practice
                </Link>
                <Link className={styles["secondaryLink"]} href={`/en/paths/${skill.slug}`}>
                  View learning path
                </Link>
              </div>
            </article>
          </MotionReveal>
        ))}
        {visiblePreviews.map((skill, index) => (
          <MotionReveal
            key={skill.slug}
            variant="zoom-in"
            delayMs={Math.min(index, 5) * 80}
            durationMs={600}
          >
            <article className={styles["catalogCard"]}>
              <span className={`${styles["status"]} ${styles["statusComingSoon"]}`}>
                Coming soon
              </span>
              <h2>{skill.title}</h2>
              <p>{skill.summary}</p>
              <p>Planned learning path · Content not yet playable</p>
              <div className={styles["cardLinks"]}>
                <span className={styles["disabledPractice"]}>Start practice unavailable</span>
                <Link
                  className={styles["secondaryLink"]}
                  href={`/en/skills/upcoming/${skill.slug}`}
                >
                  View planned learning path
                </Link>
              </div>
            </article>
          </MotionReveal>
        ))}
        {visibleSkills.length === 0 && visiblePreviews.length === 0 ? (
          <p className={styles["empty"]}>
            No skill matches that search. Try a broader word or clear the search field.
          </p>
        ) : null}
      </div>
    </>
  );
}
