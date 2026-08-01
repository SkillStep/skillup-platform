"use client";

import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";

import type { PublicSkill } from "../../../lib/public-catalog";
import styles from "../discovery.module.css";

export function SkillSearch({ skills }: Readonly<{ skills: readonly PublicSkill[] }>) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("en-US"));
  const visibleSkills = useMemo(() => {
    if (!deferredQuery) return skills;
    return skills.filter((skill) =>
      [skill.title, skill.summary, ...skill.outcomes]
        .join(" ")
        .toLocaleLowerCase("en-US")
        .includes(deferredQuery),
    );
  }, [deferredQuery, skills]);

  return (
    <>
      <search className={styles["searchPanel"]}>
        <label htmlFor={inputId}>Search the launch catalog</label>
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

      <p aria-live="polite" className="visually-hidden">
        {visibleSkills.length} {visibleSkills.length === 1 ? "skill" : "skills"} shown.
      </p>

      <div className={styles["catalogGrid"]}>
        {visibleSkills.map((skill) => (
          <article className={styles["catalogCard"]} key={skill.slug}>
            <span
              className={`${styles["status"]} ${
                skill.status === "pilot" ? styles["statusPilot"] : styles["statusPlanned"]
              }`}
            >
              {skill.status === "pilot" ? "Reviewed pilot" : "Reviewed launch path"}
            </span>
            <h2>{skill.title}</h2>
            <p>{skill.summary}</p>
            <div className={styles["cardLinks"]}>
              <Link className={styles["primaryLink"]} href={`/en/learn/${skill.levelId}`}>
                Start practice
              </Link>
              <Link className={styles["secondaryLink"]} href={`/en/paths/${skill.slug}`}>
                View learning path
              </Link>
            </div>
          </article>
        ))}
        {visibleSkills.length === 0 ? (
          <p className={styles["empty"]}>
            No launch skill matches that search. Try a broader word or clear the search field.
          </p>
        ) : null}
      </div>
    </>
  );
}
