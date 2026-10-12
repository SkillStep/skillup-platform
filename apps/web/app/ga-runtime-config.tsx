import type { ReactElement } from "react";

/**
 * Exposes the GA4 Measurement ID at request time so staging/production can
 * configure tracking via container `.env` without rebuilding the web image.
 * NEXT_PUBLIC_* alone is build-time only in the Next standalone image.
 */
export function GaRuntimeConfig(): ReactElement | null {
  const measurementId = (
    process.env["GA_MEASUREMENT_ID"] ??
    process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"] ??
    ""
  ).trim();
  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) return null;

  return <meta name="skillup-ga-measurement-id" content={measurementId} />;
}
