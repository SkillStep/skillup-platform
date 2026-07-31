import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const url = new URL("/en/account", request.nextUrl.origin);
  url.searchParams.set("payment", status);
  if (orderId) url.searchParams.set("orderId", orderId);
  return NextResponse.redirect(url, 303);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return accountRedirect(request, "pending");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
      return accountRedirect(request, "error");
    }

    const body = await request.text();
    const upstream = await fetch(
      new URL("/v1/commercial/jazzcash/callback", apiBaseUrl()),
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
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
