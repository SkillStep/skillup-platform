import type { ContentStatus } from "./schema.js";

export type LaunchCatalogSeed = Readonly<{
  skill: Readonly<{
    id: string;
    slug: string;
    status: ContentStatus;
    versionId: string;
    title: string;
    summary: string;
  }>;
  path: Readonly<{
    id: string;
    slug: string;
    status: ContentStatus;
    versionId: string;
    title: string;
    summary: string;
    estimatedMinutes: number;
    sortOrder: number;
  }>;
}>;

export const launchCatalogSeed: readonly LaunchCatalogSeed[] = [
  {
    skill: {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "interview-workplace-communication",
      status: "published",
      versionId: "11111111-1111-4111-8111-111111111112",
      title: "Interview and Workplace Communication",
      summary:
        "Practice evidence-based interview answers, professional messages and difficult workplace conversations.",
    },
    path: {
      id: "11111111-1111-4111-8111-111111111113",
      slug: "interview-workplace-communication-foundations",
      status: "published",
      versionId: "11111111-1111-4111-8111-111111111114",
      title: "Interview and Workplace Communication Foundations",
      summary:
        "Build clear introductions, stronger interview evidence and reliable everyday workplace communication.",
      estimatedMinutes: 180,
      sortOrder: 1,
    },
  },
  {
    skill: {
      id: "22222222-2222-4222-8222-222222222221",
      slug: "practical-english-study-work",
      status: "draft",
      versionId: "22222222-2222-4222-8222-222222222222",
      title: "Practical English for Study and Work",
      summary:
        "Build clearer vocabulary, instructions and everyday study and workplace communication through context.",
    },
    path: {
      id: "22222222-2222-4222-8222-222222222223",
      slug: "practical-english-study-work-foundations",
      status: "draft",
      versionId: "22222222-2222-4222-8222-222222222224",
      title: "Practical English for Study and Work Foundations",
      summary:
        "Practice high-frequency English for instructions, messages and common study and workplace situations.",
      estimatedMinutes: 220,
      sortOrder: 2,
    },
  },
  {
    skill: {
      id: "33333333-3333-4333-8333-333333333331",
      slug: "ai-tools-study-work",
      status: "draft",
      versionId: "33333333-3333-4333-8333-333333333332",
      title: "AI Tools for Study and Work",
      summary:
        "Use AI responsibly, write clearer instructions and verify outputs before relying on them.",
    },
    path: {
      id: "33333333-3333-4333-8333-333333333333",
      slug: "ai-tools-study-work-foundations",
      status: "draft",
      versionId: "33333333-3333-4333-8333-333333333334",
      title: "AI Tools for Study and Work Foundations",
      summary:
        "Learn safe prompting, output verification, privacy boundaries and practical AI-assisted workflows.",
      estimatedMinutes: 160,
      sortOrder: 3,
    },
  },
  {
    skill: {
      id: "44444444-4444-4444-8444-444444444441",
      slug: "freelancing-foundations",
      status: "draft",
      versionId: "44444444-4444-4444-8444-444444444442",
      title: "Freelancing Foundations",
      summary:
        "Understand client briefs, proposals, scope, revisions, handover and common freelancing safety risks.",
    },
    path: {
      id: "44444444-4444-4444-8444-444444444443",
      slug: "freelancing-foundations-path",
      status: "draft",
      versionId: "44444444-4444-4444-8444-444444444444",
      title: "Freelancing Foundations Path",
      summary:
        "Build a basic offer, interpret briefs and communicate scope, revisions and handover clearly.",
      estimatedMinutes: 190,
      sortOrder: 4,
    },
  },
  {
    skill: {
      id: "55555555-5555-4555-8555-555555555551",
      slug: "digital-marketing-foundations",
      status: "draft",
      versionId: "55555555-5555-4555-8555-555555555552",
      title: "Digital Marketing Foundations",
      summary:
        "Learn audience, offer, funnel, content and measurement fundamentals through realistic scenarios.",
    },
    path: {
      id: "55555555-5555-4555-8555-555555555553",
      slug: "digital-marketing-foundations-path",
      status: "draft",
      versionId: "55555555-5555-4555-8555-555555555554",
      title: "Digital Marketing Foundations Path",
      summary:
        "Understand audience, channels, content objectives and practical measurement without vanity claims.",
      estimatedMinutes: 210,
      sortOrder: 5,
    },
  },
] as const;
