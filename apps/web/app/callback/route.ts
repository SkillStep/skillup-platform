import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { publicAppOrigin } from "../../lib/public-app-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Compatibility return path. Prefer /en/account/payment-return for JazzCash allowlists.
 */

function apiBaseUrl(): URL {
  const value = process.env["API_BASE_URL"] ?? "http://127.0.0.1:3001";
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

function accountRedirect(request: NextRequest, status: string, orderId?: string): NextResponse {
  const appOrigin = publicAppOrigin(request);
  const account = new URL("/en/account", appOrigin);
  account.searchParams.set("payment", status);
  if (orderId) account.searchParams.set("orderId", orderId);

  if (!hasSessionCookie(request)) {
    const signIn = new URL("/en/sign-in", appOrigin);
    signIn.searchParams.set("returnTo", `${account.pathname}${account.search}`);
    return NextResponse.redirect(signIn, 303);
  }

  return NextResponse.redirect(account, 303);
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

async function completeLink(request: NextRequest): Promise<NextResponse> {
  try {
    const fields = await collectFields(request);
    if (Object.keys(fields).length === 0) {
      return accountRedirect(request, "error");
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

    if (!upstream.ok) return accountRedirect(request, "error");

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
    return accountRedirect(request, normalized, payload.order?.id);
  } catch {
    return accountRedirect(request, "error");
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return completeLink(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return completeLink(request);
}
