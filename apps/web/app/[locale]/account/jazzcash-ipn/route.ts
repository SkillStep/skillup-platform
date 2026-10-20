import type { NextRequest, NextResponse } from "next/server";

import { GET as rootGet, POST as rootPost } from "../../../../jazzcash/ipn/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Locale-scoped IPN alias: /en/account/jazzcash-ipn */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return rootPost(request);
}

export async function GET(): Promise<NextResponse> {
  return rootGet();
}
