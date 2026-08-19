"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { withReturnTo } from "../../../../lib/return-to";

type Props = Readonly<{ children: ReactNode }>;

export function PremiumAuthBoundary({ children }: Props) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/v1/admin/session", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 401) {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          window.location.replace(withReturnTo("/en/sign-in", returnTo));
          return;
        }
        setChecked(true);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setChecked(true);
      });

    return () => controller.abort();
  }, []);

  return checked ? children : null;
}
