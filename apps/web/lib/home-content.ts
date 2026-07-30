export type LaunchPath = Readonly<{
  slug: string;
  title: string;
  summary: string;
  status: "pilot" | "planned";
}>;

export const launchPaths: readonly LaunchPath[] = [
  {
    slug: "interview-workplace-communication",
    title: "Interview and Workplace Communication",
    summary:
      "Practice evidence-based interview answers, professional messages and difficult workplace conversations.",
    status: "pilot",
  },
  {
    slug: "practical-english-study-work",
    title: "Practical English for Study and Work",
    summary:
      "Build clearer vocabulary, instructions and everyday study and workplace communication.",
    status: "planned",
  },
  {
    slug: "ai-tools-study-work",
    title: "AI Tools for Study and Work",
    summary:
      "Use AI responsibly, write better instructions and verify output before relying on it.",
    status: "planned",
  },
  {
    slug: "freelancing-foundations",
    title: "Freelancing Foundations",
    summary:
      "Understand client briefs, proposals, scope, revisions, handover and common safety risks.",
    status: "planned",
  },
  {
    slug: "digital-marketing-foundations",
    title: "Digital Marketing Foundations",
    summary:
      "Learn audience, offer, funnel, content and measurement fundamentals through scenarios.",
    status: "planned",
  },
] as const;

export function featuredPath(): LaunchPath {
  const pilot = launchPaths.find((path) => path.status === "pilot");
  if (!pilot) throw new Error("A reviewed pilot path is required.");
  return pilot;
}
