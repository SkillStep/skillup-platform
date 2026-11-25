import { createHmac, timingSafeEqual } from "node:crypto";

/** Query / cookie name for the signed JazzCash conversion receipt (§3A). */
export const CONVERSION_RECEIPT_PARAM = "cv";
export const CONVERSION_RECEIPT_COOKIE = "skillup_cv_receipt";

/** Short TTL so a leaked `cv` cannot be replayed indefinitely. */
const RECEIPT_TTL_MS = 15 * 60 * 1000;

type ReceiptPayload = Readonly<{
  orderId: string;
  status: string;
  exp: number;
}>;

function receiptSecret(): string | null {
  const dedicated = process.env["CONVERSION_RECEIPT_SECRET"]?.trim();
  if (dedicated && dedicated.length >= 32) return dedicated;
  const session = process.env["SESSION_SECRET"]?.trim();
  if (session && session.length >= 32) return session;
  return null;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Sign a conversion receipt for JazzCash success redirects.
 * Returns null when no signing secret is configured (Subscribe still uses orderId grant).
 */
export function signConversionReceipt(
  orderId: string,
  status: string,
  nowMs: number = Date.now(),
): string | null {
  const secret = receiptSecret();
  if (!secret) return null;
  const trimmedOrder = orderId.trim();
  if (!trimmedOrder) return null;
  const payload: ReceiptPayload = {
    orderId: trimmedOrder,
    status: status.trim() || "succeeded",
    exp: nowMs + RECEIPT_TTL_MS,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${signBody(body, secret)}`;
}

/** Verify a `cv` receipt; optionally require a specific order id. */
export function verifyConversionReceipt(
  receipt: string,
  options: Readonly<{ orderId?: string; nowMs?: number }> = {},
): Readonly<{ ok: true; orderId: string; status: string } | { ok: false; reason: string }> {
  const secret = receiptSecret();
  if (!secret) return { ok: false, reason: "secret_missing" };

  const trimmed = receipt.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };

  const body = trimmed.slice(0, dot);
  const signature = trimmed.slice(dot + 1);
  if (!body || !signature) return { ok: false, reason: "malformed" };
  if (!safeEqual(signature, signBody(body, secret))) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: ReceiptPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body)) as ReceiptPayload;
  } catch {
    return { ok: false, reason: "bad_payload" };
  }

  if (!payload || typeof payload !== "object") return { ok: false, reason: "bad_payload" };
  if (typeof payload.orderId !== "string" || !payload.orderId.trim()) {
    return { ok: false, reason: "bad_order" };
  }
  if (typeof payload.status !== "string" || !payload.status.trim()) {
    return { ok: false, reason: "bad_status" };
  }
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return { ok: false, reason: "bad_exp" };
  }

  const nowMs = options.nowMs ?? Date.now();
  if (payload.exp < nowMs) return { ok: false, reason: "expired" };

  if (options.orderId && options.orderId.trim() !== payload.orderId.trim()) {
    return { ok: false, reason: "order_mismatch" };
  }

  if (payload.status !== "succeeded") {
    return { ok: false, reason: "not_succeeded" };
  }

  return { ok: true, orderId: payload.orderId.trim(), status: payload.status };
}

/** Cookie options that survive JazzCash cross-site POST returns (HTTPS). */
export function conversionReceiptCookieOptions(requestUrl: URL): Readonly<{
  httpOnly: true;
  path: string;
  maxAge: number;
  sameSite: "none" | "lax";
  secure: boolean;
}> {
  const secure = requestUrl.protocol === "https:";
  return {
    httpOnly: true,
    path: "/",
    maxAge: Math.floor(RECEIPT_TTL_MS / 1000),
    // SameSite=None only works with Secure; fall back to Lax on local http.
    sameSite: secure ? "none" : "lax",
    secure,
  };
}
