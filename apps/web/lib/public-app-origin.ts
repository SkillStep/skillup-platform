import type { NextRequest } from "next/server";

/**
 * Public browser origin for redirects and upstream Origin headers.
 * Never use request.nextUrl.origin behind Docker (HOSTNAME=0.0.0.0).
 */
export function publicAppOrigin(request: NextRequest): string {
  const configured = process.env["PUBLIC_APP_URL"]?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.origin;
      }
    } catch {
      // fall through to forwarded headers
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : request.nextUrl.protocol.replace(":", "") || "https";

  if (host && host !== "0.0.0.0" && !host.startsWith("0.0.0.0:")) {
    return `${proto}://${host}`;
  }

  throw new Error("PUBLIC_APP_URL is required for JazzCash return redirects.");
}
