import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { publicAppOrigin } from "../../../../lib/public-app-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * JazzCash MWallet recurring return URL handler (DOC 2026).
 * Staging return URL: /en/account/payment-return
 * Collects pp_* from form POST or query, completes wallet-link + pay-via-token server-side.
 *
 * Session cookie is optional here: JazzCash returns via cross-site POST and often omits it.
 * The API completes from the signed pp_RequestID → wallet-link intent mapping.
 */

function apiBaseUrl(): URL {
  const value = process.env["API_BASE_URL"];
  if (!value) throw new Error("API_BASE_URL is required for the JazzCash return handler.");
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_BASE_URL must use HTTP or HTTPS.");
  }
  return url;
}

function hasSessionCookie(request: NextRequest): boolean {
  const name = process.env["SESSION_COOKIE_NAME"]?.trim() || "skillup_session";
  return Boolean(request.cookies.get(name)?.value);
}

function paymentResultRedirect(
  request: NextRequest,
  status: string,
  orderId?: string,
): NextResponse {
  const appOrigin = publicAppOrigin(request);
  const home = new URL("/en", appOrigin);
  home.searchParams.set("payment", status);
  if (orderId) home.searchParams.set("orderId", orderId);

  if (!hasSessionCookie(request)) {
    const signIn = new URL("/en/sign-in", appOrigin);
    signIn.searchParams.set("returnTo", `${home.pathname}${home.search}`);
    return NextResponse.redirect(signIn, 303);
  }

  return NextResponse.redirect(home, 303);
}

async function collectFields(request: NextRequest): Promise<Record<string, string>> {
  const fields: Record<string, string> = {};
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string" && key.startsWith("pp_")) fields[key] = value;
    }
    return fields;
  }
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (key.startsWith("pp_")) fields[key] = value;
  }
  return fields;
}

function emptyGetResponse(request: NextRequest): NextResponse {
  const accept = request.headers.get("accept") ?? "";
  // Browser navigations should not sit on the smoke-check plain-text page.
  if (accept.includes("text/html")) {
    return paymentResultRedirect(request, "error");
  }
  return new NextResponse("JazzCash return handler ready", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function completeLink(request: NextRequest): Promise<NextResponse> {
  try {
    const fields = await collectFields(request);
    if (Object.keys(fields).length === 0) {
      if (request.method === "GET") return emptyGetResponse(request);
      return paymentResultRedirect(request, "error");
    }

    const appOrigin = publicAppOrigin(request);
    const cookie = request.headers.get("cookie") ?? "";
    const upstream = await fetch(
      new URL("/v1/premium/billing/jazzcash-v11/link/complete", apiBaseUrl()),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          origin: appOrigin,
        },
        body: JSON.stringify({ fields }),
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(45_000),
      },
    );

    if (!upstream.ok) return paymentResultRedirect(request, "error");

    const payload = (await upstream.json()) as Readonly<{
      order?: Readonly<{ id?: string; status?: string }>;
    }>;
    const status = payload.order?.status;
    const normalized =
      status === "succeeded" ||
      status === "pending" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "expired" ||
      status === "refunded"
        ? status
        : "error";
    return paymentResultRedirect(request, normalized, payload.order?.id);
  } catch {
    return paymentResultRedirect(request, "error");
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return completeLink(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return completeLink(request);
}
