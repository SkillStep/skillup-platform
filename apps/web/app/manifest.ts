import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SkillUp",
    short_name: "SkillUp",
    description: "Practical skills through short mobile-first learning games.",
    start_url: "/en",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#4338CA",
    orientation: "portrait-primary",
    lang: "en-PK",
    categories: ["education", "productivity"],
  };
}
