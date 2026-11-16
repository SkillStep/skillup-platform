/**
 * Curated public PREVIEW ONLY, separate from published /v1/catalog/courses.
 * Exact descriptions are from the product-team brief; no draft lessons,
 * private answer keys, Premium claims or learner-access URLs belong here.
 */
export type ComingSoonSkill = Readonly<{
  slug: string;
  publishedAliases: readonly string[];
  title: string;
  summary: string;
  keywords: readonly string[];
  modules: readonly string[];
}>;

export const comingSoonSkills: readonly ComingSoonSkill[] = [
  {
    slug: "prompt-engineering-generative-ai",
    publishedAliases: [],
    title: "Prompt Engineering & Generative AI",
    summary: "Learn to write effective AI prompts, improve responses and check AI-generated results for accuracy.",
    keywords: ["prompt", "generative", "chatbot", "fact checking"],
    modules: [
      "Prompt Basics and Clear Instructions",
      "Context, Constraints and Iteration",
      "Output Evaluation and Fact-Checking",
      "Reusable Prompt Toolkit Capstone",
    ],
  },
  {
    slug: "cybersecurity-digital-safety",
    publishedAliases: [],
    title: "Cybersecurity & Digital Safety",
    summary: "Learn to spot scams, recognize phishing attempts and protect accounts and personal information online.",
    keywords: ["security", "phishing", "scams", "passwords", "privacy"],
    modules: [
      "Recognizing Phishing and Scams",
      "Passwords and Account Security",
      "Privacy and Data Protection",
      "Scam Response and Safety Capstone",
    ],
  },
  {
    slug: "data-analytics-dashboards",
    publishedAliases: ["data-analytics-decision-making"],
    title: "Data Analytics & Decision Making",
    summary: "Practice reading charts, finding patterns and using simple data to make better everyday decisions.",
    keywords: ["spreadsheets", "charts", "data", "dashboards", "decisions"],
    modules: [
      "Tables, Questions and Data Quality",
      "Charts, Trends and Meaningful Metrics",
      "Interpretation, Uncertainty and Comparing Options",
      "Data-backed Decision Memo and Dashboard Capstone",
    ],
  },
  {
    slug: "applied-ai-workflows",
    publishedAliases: ["ai-automation-no-code-tools"],
    title: "AI Automation & No-Code Tools",
    summary: "Learn how simple workflows connect digital tools and automate repetitive tasks without advanced coding.",
    keywords: ["automation", "no-code", "triggers", "workflows"],
    modules: [
      "Workflow Opportunities and Safe Task Boundaries",
      "Triggers, Actions and No-Code Connectors",
      "Conditions, Human Approvals and Privacy",
      "Automation Testing, Recovery and Capstone",
    ],
  },
  {
    slug: "sales-client-negotiation",
    publishedAliases: ["sales-negotiation-client-management"],
    title: "Sales, Negotiation & Client Management",
    summary: "Build confidence in client conversations, handle objections and practice practical negotiation skills.",
    keywords: ["sales", "clients", "objections", "retention", "negotiation"],
    modules: [
      "Client Discovery and Active Listening",
      "Presenting Offers and Ethical Objection Handling",
      "Fair Negotiation, Pricing and Boundaries",
      "Follow-up, Client Retention and Conversation Capstone",
    ],
  },
] as const;

/** Use only the authoritative published course API to mark a preview playable. */
export function filterUnpublishedPreviews(
  published: readonly { slug: string }[],
): readonly ComingSoonSkill[] {
  const present = new Set(published.map((item) => item.slug));
  return comingSoonSkills.filter(
    (skill) =>
      !present.has(skill.slug) &&
      !skill.publishedAliases.some((alias) => present.has(alias)),
  );
}

export function previewBySlug(slug: string): ComingSoonSkill | null {
  return comingSoonSkills.find((skill) => skill.slug === slug) ?? null;
}
