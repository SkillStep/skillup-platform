"use client";

import Link from "next/link";
import { type ReactElement, useEffect, useState } from "react";

import { clearPremiumUnlockedFlag } from "../../lib/premium-unlock";
import styles from "./discovery.module.css";

type AuthState = "checking" | "signed-out" | "signed-in";

export function AuthNavAction({
  variant = "desktop",
}: Readonly<{
  variant?: "desktop" | "mobile";
}>): ReactElement {
  const [state, setState] = useState<AuthState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        setState(response.ok ? "signed-in" : "signed-out");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setState("signed-out");
        }
      });
    return () => controller.abort();
  }, []);

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } catch {
      // Still clear local client state even if the network call fails.
    } finally {
      clearPremiumUnlockedFlag();
      window.location.assign("/en/sign-in");
    }
  }

  if (state === "signed-in") {
    if (variant === "mobile") {
      return (
        <button type="button" onClick={() => void logout()} disabled={busy}>
          {busy ? "Signing out…" : "Sign out"}
        </button>
      );
    }
    return (
      <button
        type="button"
        className={styles["navAction"]}
        onClick={() => void logout()}
        disabled={busy}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    );
  }

  if (variant === "mobile") {
    return <Link href="/en/sign-up">Sign up</Link>;
  }

  return (
    <Link className={styles["navAction"]} href="/en/sign-up">
      Sign up
    </Link>
  );
}
