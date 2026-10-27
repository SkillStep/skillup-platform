import type { MetadataRoute } from "next";

/** Extended fields not yet on Next's Manifest type. */
type SkillUpManifest = MetadataRoute.Manifest & {
  handle_links?: "auto" | "preferred" | "not-preferred";
};

export default function manifest(): SkillUpManifest {
  return {
    id: "/en",
    name: "SkillUp — Learn. Play. Level Up.",
    short_name: "SkillUp",
    description: "Practical skills through short mobile-first learning games.",
    start_url: "/en",
    // Keep PWA in the learner app only — campaign landings (/mainLanding, /landing2)
    // stay outside scope so shared links open in the browser, not the desktop app.
    scope: "/en",
    handle_links: "not-preferred",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#4338CA",
    orientation: "portrait-primary",
    lang: "en-PK",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icons/skillup-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/skillup-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Browse skills",
        short_name: "Skills",
        description: "Open the reviewed SkillUp launch catalog.",
        url: "/en/skills",
        icons: [{ src: "/icons/skillup-icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Your progress",
        short_name: "Progress",
        description: "Open your private SkillUp progress dashboard.",
        url: "/en/progress",
        icons: [{ src: "/icons/skillup-icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
  };
}
