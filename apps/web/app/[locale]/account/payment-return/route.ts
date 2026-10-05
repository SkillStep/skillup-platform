import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { publicAppOrigin } from "../../../../lib/public-app-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * JazzCash MWallet recurring return URL handler (DOC 2026).
 * Staging return URL: /en/account/payment-return
 * Collects pp_* from form POST or query, completes wallet-link + pay-via-token server-side.
 */

const RETURN_STASH_COOKIE = "skillup_jc_return";

function apiBaseUrl(): URL {
  const value = process.env["API_BASE_URL"];
  if (!value) throw new Error("API_BASE_URL is required for the JazzCash return handler.");
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_BASE_URL must use HTTP or HTTPS.");
  }
  return url;
}

function accountRedirect(request: NextRequest, status: string, orderId?: string): NextResponse {
  const url = new URL("/en/account", publicAppOrigin(request));
  url.searchParams.set("payment", status);
  if (orderId) url.searchParams.set("orderId", orderId);
  const response = NextResponse.redirect(url, 303);
  clearReturnStash(response);
  return response;
}

function clearReturnStash(response: NextResponse): void {
  response.cookies.set({
    name: RETURN_STASH_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function stashReturnFields(response: NextResponse, fields: Readonly<Record<string, string>>): void {
  response.cookies.set({
    name: RETURN_STASH_COOKIE,
    value: encodeURIComponent(JSON.stringify(fields)),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });
}

function readStashedFields(request: NextRequest): Record<string, string> | null {
  const raw = request.cookies.get(RETURN_STASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith("pp_") && typeof value === "string" && value.trim()) {
        fields[key] = value;
      }
    }
    return Object.keys(fields).length > 0 ? fields : null;
  } catch {
    return null;
  }
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
    let fields = await collectFields(request);
    if (Object.keys(fields).length === 0) {
      fields = readStashedFields(request) ?? {};
    }

    if (Object.keys(fields).length === 0) {
      // Bare GET is used by staging edge smoke checks; JazzCash always posts/redirects with pp_*.
      if (request.method === "GET") {
        return new NextResponse("JazzCash return handler ready", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
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

    if (upstream.status === 401) {
      const signIn = new URL("/en/sign-in", appOrigin);
      signIn.searchParams.set("returnTo", "/en/account/payment-return");
      const response = NextResponse.redirect(signIn, 303);
      stashReturnFields(response, fields);
      return response;
    }
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
