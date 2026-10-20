import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public JazzCash IPN edge.
 * Register with JazzCash: https://<host>/jazzcash/ipn
 * Forwards pp_* fields to the API IPN handler (hash verify + idempotent settle).
 */

function apiBaseUrl(): URL {
  const value = process.env["API_BASE_URL"];
  if (!value) throw new Error("API_BASE_URL is required for the JazzCash IPN handler.");
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_BASE_URL must use HTTP or HTTPS.");
  }
  return url;
}

async function collectFields(request: NextRequest): Promise<Record<string, string>> {
  const fields: Record<string, string> = {};
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string" && key.startsWith("pp_")) fields[key] = value;
    }
    return fields;
  }
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (typeof value === "string" && key.startsWith("pp_")) fields[key] = value;
      }
    }
    return fields;
  }
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (key.startsWith("pp_")) fields[key] = value;
  }
  return fields;
}

async function forwardIpn(request: NextRequest): Promise<NextResponse> {
  const fields = await collectFields(request);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ received: true, status: "ignored_empty" }, { status: 200 });
  }

  const upstream = await fetch(new URL("/v1/commercial/jazzcash/ipn", apiBaseUrl()), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fields),
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });

  const payload = await upstream.json().catch(() => ({ received: true }));
  return NextResponse.json(payload, { status: upstream.ok ? 200 : upstream.status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return forwardIpn(request);
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse("JazzCash IPN handler ready", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
