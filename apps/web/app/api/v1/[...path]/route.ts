import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestHeadersToRemove = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const responseHeadersToRemove = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

type RouteContext = Readonly<{
  params: Promise<{ path: string[] }>;
}>;

function apiBaseUrl(): URL {
  const value = process.env["API_BASE_URL"];
  if (!value) throw new Error("API_BASE_URL is required for the web API proxy.");

  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_BASE_URL must use HTTP or HTTPS.");
  }
  return url;
}

function requestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const name of requestHeadersToRemove) headers.delete(name);
  headers.set("x-forwarded-host", request.headers.get("host") ?? "unknown");
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!responseHeadersToRemove.has(name.toLowerCase()) && name.toLowerCase() !== "set-cookie") {
      headers.append(name, value);
    }
  });

  const cookieHeaders = (
    upstream.headers as Headers & Readonly<{ getSetCookie?: () => readonly string[] }>
  ).getSetCookie?.();
  if (cookieHeaders) {
    for (const cookie of cookieHeaders) headers.append("set-cookie", cookie);
  } else {
    const cookie = upstream.headers.get("set-cookie");
    if (cookie) headers.append("set-cookie", cookie);
  }

  headers.set("cache-control", "private, no-store");
  return headers;
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const { path } = await context.params;
    const target = new URL(`/v1/${path.map(encodeURIComponent).join("/")}`, apiBaseUrl());
    target.search = request.nextUrl.search;

    const method = request.method.toUpperCase();
    const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
    const upstream = await fetch(target, {
      method,
      headers: requestHeaders(request),
      body,
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream),
    });
  } catch {
    return NextResponse.json(
      {
        code: "upstream_unavailable",
        message: "The SkillUp service is temporarily unavailable.",
      },
      {
        status: 502,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
