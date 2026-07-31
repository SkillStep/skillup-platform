import { canonicalUrl } from "@skillup/discoverability";
import type { MetadataRoute } from "next";

import { launchCategory, publicSkills } from "../lib/public-catalog";

const publicAppUrl = process.env["PUBLIC_APP_URL"] ?? "http://localhost:3000";
const lastModified = new Date("2026-07-31T00:00:00.000Z");

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: canonicalUrl(publicAppUrl, "en"),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: canonicalUrl(publicAppUrl, "en", "/skills"),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: canonicalUrl(publicAppUrl, "en", "/pricing"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: canonicalUrl(publicAppUrl, "en", `/categories/${launchCategory.slug}`),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...publicSkills.flatMap((skill) => [
      {
        url: canonicalUrl(publicAppUrl, "en", `/skills/${skill.slug}`),
        lastModified,
        changeFrequency: skill.status === "pilot" ? ("monthly" as const) : ("weekly" as const),
        priority: skill.status === "pilot" ? 0.9 : 0.7,
      },
      {
        url: canonicalUrl(publicAppUrl, "en", `/paths/${skill.slug}`),
        lastModified,
        changeFrequency: skill.status === "pilot" ? ("monthly" as const) : ("weekly" as const),
        priority: skill.status === "pilot" ? 0.9 : 0.65,
      },
    ]),
  ];
}
