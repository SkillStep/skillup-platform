"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { withReturnTo } from "../../../../lib/return-to";
import { LevelPlayer } from "./level-player";
import styles from "./level-player.module.css";

type AuthenticatedLevelPlayerProps = Readonly<{
  levelId: string;
  locale: "en" | "ur";
}>;

type EntryState = "checking" | "authenticated" | "unavailable";

export function AuthenticatedLevelPlayer({ levelId, locale }: AuthenticatedLevelPlayerProps) {
  const [state, setState] = useState<EntryState>("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const response = await fetch("/api/v1/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          window.location.replace(withReturnTo(`/${locale}/sign-in`, returnTo));
          return;
        }
        if (!response.ok) {
          setMessage("Your private learning session could not be checked safely.");
          setState("unavailable");
          return;
        }

        setState("authenticated");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage("SkillUp could not be reached. Check your connection and try again.");
          setState("unavailable");
        }
      }
    }

    void checkSession();
    return () => controller.abort();
  }, [locale]);

  if (state === "authenticated") return <LevelPlayer levelId={levelId} locale={locale} />;

  return (
    <section className={styles["player"]} aria-live="polite">
      <div className={styles["loading"]}>
        <h1>{state === "checking" ? "Checking your learning session…" : "Level unavailable"}</h1>
        <p>
          {state === "checking"
            ? "Your intended level will open after your private session is verified."
            : (message ?? "The level could not be opened safely.")}
        </p>
        {state === "unavailable" ? (
          <Link className={styles["homeButton"]} href={`/${locale}`}>
            Return home
          </Link>
        ) : null}
      </div>
    </section>
  );
}
