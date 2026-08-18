import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: "ok",
      service: "skillup-web",
      version: "0.0.0",
      releaseSha: process.env["RELEASE_SHA"] ?? "local",
      pipelineId: process.env["RELEASE_PIPELINE_ID"] ?? "local",
      artifactRef: process.env["RELEASE_ARTIFACT_REF"] ?? "local",
      imageDigest: process.env["RELEASE_IMAGE_DIGEST"] ?? "local",
      rollbackRef: process.env["ROLLBACK_ARTIFACT_REF"] ?? "unknown",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
