import type { MetadataRoute } from "next";

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = new URL(publicAppUrl);

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/en", "/en/skills", "/en/categories", "/en/paths"],
        disallow: [
          "/app",
          "/admin",
          "/api",
          "/offline",
          "/en/sign-in",
          "/en/onboarding",
          "/en/progress",
          "/en/learn",
        ],
      },
    ],
    host: baseUrl.origin,
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
  };
}
