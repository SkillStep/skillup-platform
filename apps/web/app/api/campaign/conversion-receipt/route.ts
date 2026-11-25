import { NextResponse } from "next/server";

import {
  CONVERSION_RECEIPT_COOKIE,
  verifyConversionReceipt,
} from "../../../../lib/conversion-receipt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type VerifyBody = Readonly<{
  orderId?: string;
  receipt?: string;
}>;

/**
 * Verifies a JazzCash conversion receipt before the browser fires TikTok Subscribe (§3A).
 * Accepts `receipt` (`cv` query value) in the JSON body, or the httpOnly receipt cookie.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: VerifyBody = {};
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    body = {};
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  let receipt = typeof body.receipt === "string" ? body.receipt.trim() : "";

  if (!receipt) {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const match = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${CONVERSION_RECEIPT_COOKIE}=`));
    if (match) {
      receipt = decodeURIComponent(match.slice(CONVERSION_RECEIPT_COOKIE.length + 1));
    }
  }

  if (!receipt) {
    return NextResponse.json({ ok: false, reason: "receipt_missing" }, { status: 400 });
  }

  const result = verifyConversionReceipt(receipt, orderId ? { orderId } : {});
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    orderId: result.orderId,
    status: result.status,
  });
}
