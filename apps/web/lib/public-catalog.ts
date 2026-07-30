export type PublicSkillStatus = "pilot" | "planned";

export type PublicSkill = Readonly<{
  slug: string;
  title: string;
  summary: string;
  status: PublicSkillStatus;
  outcomes: readonly string[];
  editorialNote: string | null;
  modules: readonly string[];
  challengeTypes: readonly string[];
  levelId: string | null;
  reviewCadence: string;
}>;

export const launchCategory = {
  slug: "launch-skills",
  title: "Launch skills",
  summary:
    "A small reviewed catalog focused on practical communication, language, AI, freelancing and digital marketing skills for Pakistani learners.",
} as const;

export const publicSkills: readonly PublicSkill[] = [
  {
    slug: "interview-workplace-communication",
    title: "Interview and Workplace Communication",
    summary:
      "Practice evidence-based interview answers, professional messages and difficult workplace conversations.",
    status: "pilot",
    outcomes: [
      "Introduce yourself clearly.",
      "Answer common interview questions with evidence.",
      "Ask useful clarifying questions.",
      "Write concise workplace messages.",
      "Handle feedback, disagreement and follow-up professionally.",
      "Recognize weak, vague or risky communication patterns.",
    ],
    editorialNote:
      "This is the first reviewed pilot because it has broad relevance, measurable outcomes and strong scenario-gameplay fit.",
    modules: [
      "Introductions and confidence",
      "Interview answers with evidence",
      "Workplace messages and email basics",
      "Feedback, disagreement and difficult conversations",
      "Meetings, follow-up and professional reliability",
    ],
    challengeTypes: [
      "Scenario decisions",
      "Multiple choice",
      "Ordering",
      "Fill in the blank",
      "Short-response practice with review-aware feedback",
    ],
    levelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    reviewCadence: "Reviewed at least every 12 months and after material learner feedback.",
  },
  {
    slug: "practical-english-study-work",
    title: "Practical English for Study and Work",
    summary:
      "Build clearer vocabulary, instructions and everyday study and workplace communication.",
    status: "planned",
    outcomes: [
      "Improve high-frequency vocabulary and sentence clarity.",
      "Understand common study and workplace instructions.",
      "Write short, useful messages.",
      "Identify frequent grammar and tone mistakes.",
      "Build confidence through contextual practice.",
    ],
    editorialNote: "This path will not promise fluency through a fixed number of levels.",
    modules: [],
    challengeTypes: [],
    levelId: null,
    reviewCadence: "Reviewed at least every 12 months and after material learner feedback.",
  },
  {
    slug: "ai-tools-study-work",
    title: "AI Tools for Study and Work",
    summary:
      "Use AI responsibly, write better instructions and verify output before relying on it.",
    status: "planned",
    outcomes: [
      "Choose appropriate AI tasks.",
      "Write clear instructions and provide context.",
      "Verify outputs and identify hallucinations.",
      "Protect private information.",
      "Use AI for study, writing, analysis and productivity responsibly.",
      "Understand when not to use AI.",
    ],
    editorialNote:
      "AI-tool content requires frequent review because tools, model behavior and policies change.",
    modules: [],
    challengeTypes: [],
    levelId: null,
    reviewCadence: "Reviewed at least every 90 days before public publication.",
  },
  {
    slug: "freelancing-foundations",
    title: "Freelancing Foundations",
    summary:
      "Understand client briefs, proposals, scope, revisions, handover and common safety risks.",
    status: "planned",
    outcomes: [
      "Choose a service and define a basic offer.",
      "Interpret a client brief.",
      "Ask scope questions.",
      "Write a concise proposal.",
      "Manage expectations, revisions and handover.",
      "Identify scams and unsafe payment or credential requests.",
    ],
    editorialNote: "SkillUp will not make guaranteed-income claims.",
    modules: [],
    challengeTypes: [],
    levelId: null,
    reviewCadence: "Reviewed at least every 12 months and after material learner feedback.",
  },
  {
    slug: "digital-marketing-foundations",
    title: "Digital Marketing Foundations",
    summary:
      "Learn audience, offer, funnel, content and measurement fundamentals through scenarios.",
    status: "planned",
    outcomes: [
      "Understand audience, offer, funnel and channel basics.",
      "Distinguish organic, paid, search and social activity.",
      "Define a simple content objective.",
      "Interpret basic campaign metrics.",
      "Recognize misleading claims and vanity metrics.",
      "Create a small, measurable campaign plan.",
    ],
    editorialNote: "Platform-specific material will include a visible review date.",
    modules: [],
    challengeTypes: [],
    levelId: null,
    reviewCadence: "Platform-specific content is reviewed at least every 90 days.",
  },
] as const;

export function publicSkill(slug: string): PublicSkill | null {
  return publicSkills.find((skill) => skill.slug === slug) ?? null;
}

export function pilotSkill(): PublicSkill {
  const pilot = publicSkills.find((skill) => skill.status === "pilot");
  if (!pilot) throw new Error("A reviewed public pilot skill is required.");
  return pilot;
}
