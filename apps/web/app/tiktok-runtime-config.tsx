import type { ReactElement } from "react";

import { SKILLUP_TIKTOK_PIXEL_ID } from "../lib/tiktok-pixel";

/**
 * Exposes the TikTok Pixel ID at request time so staging/production can
 * configure tracking via container `.env` without rebuilding the web image.
 * Falls back to the client-provided SkillUp TikTok Pixel ID when unset.
 */
export function TikTokRuntimeConfig(): ReactElement | null {
  const pixelId = (
    process.env["TIKTOK_PIXEL_ID"] ??
    process.env["NEXT_PUBLIC_TIKTOK_PIXEL_ID"] ??
    SKILLUP_TIKTOK_PIXEL_ID
  ).trim();
  if (!/^[A-Z0-9]{10,64}$/i.test(pixelId)) return null;

  return <meta name="skillup-tiktok-pixel-id" content={pixelId} />;
}
