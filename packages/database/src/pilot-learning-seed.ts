export const pilotLearningSeed = {
  reviewedAt: new Date("2026-07-30T00:00:00.000Z"),
  category: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    slug: "career-readiness",
    title: "Career Readiness",
    summary:
      "Build practical communication, interview and workplace habits for early career opportunities in Pakistan.",
  },
  skill: {
    id: "11111111-1111-4111-8111-111111111111",
    versionId: "11111111-1111-4111-8111-111111111112",
  },
  path: {
    id: "11111111-1111-4111-8111-111111111113",
    versionId: "11111111-1111-4111-8111-111111111114",
  },
  module: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    slug: "interview-evidence",
    title: "Use Evidence in Interview Answers",
    summary:
      "Turn broad claims into concise examples that show an action, a useful result and what you learned.",
  },
  lesson: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
    versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    slug: "strong-evidence-answers",
    title: "Strong Evidence Answers",
    summary:
      "Recognize the difference between an unsupported personal claim and a specific example with a clear result.",
    estimatedMinutes: 12,
  },
  level: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
    slug: "show-dont-claim",
    title: "Show, Do Not Just Claim",
    publicSummary:
      "Practice choosing and structuring interview answers that demonstrate a useful action and measurable result.",
    instructions:
      "Complete two short challenges. Focus on evidence: the situation, the action you took and the result that followed.",
    estimatedMinutes: 4,
  },
  objective: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
    code: "INTERVIEW_EVIDENCE_01",
    statement:
      "Distinguish a specific evidence-based interview answer from a broad unsupported claim.",
  },
  challenges: [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      versionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
      slug: "choose-strongest-evidence",
      type: "multiple_choice" as const,
      prompt:
        "Which response gives the strongest evidence that the candidate improves a work process?",
      instruction: "Choose one answer.",
      explanation:
        "The strongest response names a concrete action and a result. General claims such as working hard do not show what changed.",
      publicPayload: { selectionLimit: 1 },
      privateEvaluation: { correctOptionKeys: ["evidence"] },
      points: 10,
      options: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
          key: "claim",
          label: "I work hard and always try to improve things.",
          sortOrder: 1,
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
          key: "evidence",
          label:
            "I created a reusable reporting template that reduced our weekly preparation time.",
          sortOrder: 2,
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5",
          key: "confidence",
          label: "I am confident that I can improve any process assigned to me.",
          sortOrder: 3,
        },
      ],
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6",
      versionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7",
      slug: "order-evidence-answer",
      type: "ordering" as const,
      prompt: "Put the parts of this evidence-based answer in the clearest order.",
      instruction: "Move the three parts into a logical sequence.",
      explanation:
        "A concise interview example is easiest to follow when it establishes the situation, explains the action and closes with the result.",
      publicPayload: {},
      privateEvaluation: { correctOrder: ["situation", "action", "result"] },
      points: 10,
      options: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb8",
          key: "action",
          label: "I created a shared checklist and assigned a clear owner for every step.",
          sortOrder: 1,
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9",
          key: "result",
          label: "The team submitted the next three reports on time without missing information.",
          sortOrder: 2,
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbba0",
          key: "situation",
          label: "Our weekly report was often delayed because responsibilities were unclear.",
          sortOrder: 3,
        },
      ],
    },
  ],
  source: {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    title: "SkillUp Interview Communication Pilot Editorial Brief",
    locator: "Evidence-based answers / pilot level 1",
  },
} as const;
