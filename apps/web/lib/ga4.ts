/**
 * GA4 via gtag (Measurement ID from the Firebase/GA4 property).
 * Marketing only — never the source of truth for Premium Subs reports.
 */

type GtagFunction = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFunction;
    __SKILLUP_GA_MEASUREMENT_ID__?: string;
  }
}

const SCRIPT_ID = "skillup-ga4-gtag";

function measurementId(): string | null {
  const runtime =
    typeof window !== "undefined" ? (window.__SKILLUP_GA_MEASUREMENT_ID__?.trim() ?? "") : "";
  const buildTime = process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"]?.trim() ?? "";
  const value = runtime || buildTime;
  return /^G-[A-Z0-9]+$/i.test(value) ? value : null;
}

export function isGa4Configured(): boolean {
  return measurementId() !== null;
}

function ensureGtag(): GtagFunction | null {
  if (typeof window === "undefined") return null;
  const id = measurementId();
  if (!id) return null;

  window.dataLayer = window.dataLayer ?? [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
  }

  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
    window.gtag("js", new Date());
    window.gtag("config", id, { send_page_view: false });
  }

  return window.gtag;
}

/** Fire a GA4 event. Never throws — analytics must not break checkout. */
export function logGa4Event(
  eventName: string,
  params: Readonly<Record<string, string | number | boolean | undefined>> = {},
): void {
  try {
    const gtag = ensureGtag();
    if (!gtag) return;
    const cleaned: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      cleaned[key] = value;
    }
    gtag("event", eventName, cleaned);
  } catch {
    // Ignore analytics failures.
  }
}
