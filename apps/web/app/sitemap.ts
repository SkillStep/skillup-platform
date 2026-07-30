import { canonicalUrl } from "@skillup/discoverability";
import type { MetadataRoute } from "next";

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: canonicalUrl(publicAppUrl, "en"),
      lastModified: new Date("2026-07-30T00:00:00.000Z"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
