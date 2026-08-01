export type LaunchChallengeType =
  | "multiple_choice"
  | "true_false"
  | "ordering"
  | "matching"
  | "scenario"
  | "fill_blank"
  | "short_response";

export type LaunchChallengeDefinition = Readonly<{
  key: string;
  type: LaunchChallengeType;
  prompt: string;
  instruction: string;
  explanation: string;
  publicPayload: Readonly<Record<string, unknown>>;
  privateEvaluation: Readonly<Record<string, unknown>>;
  options: readonly (readonly [string, string])[];
}>;

const formatOrder: readonly LaunchChallengeType[] = [
  "multiple_choice",
  "true_false",
  "scenario",
  "ordering",
  "matching",
  "fill_blank",
  "short_response",
];

function definition(
  type: LaunchChallengeType,
  input: Readonly<{
    objective: string;
    strong: string;
    weak: string;
  }>,
): LaunchChallengeDefinition {
  switch (type) {
    case "multiple_choice":
      return {
        key: "best-practice",
        type,
        prompt: `Which response best demonstrates how to ${input.objective}?`,
        instruction: "Choose the strongest answer.",
        explanation: `The stronger response confirms the requirement and uses evidence before acting. ${input.strong}`,
        publicPayload: { selectionLimit: 1 },
        privateEvaluation: { correctOptionKeys: ["best"] },
        options: [
          ["best", input.strong],
          ["mistake", input.weak],
          [
            "vague",
            "Use a confident general statement without checking the requirement, evidence or next action.",
          ],
        ],
      };
    case "true_false":
      return {
        key: "check-misconception",
        type,
        prompt: `True or false: ${input.weak}`,
        instruction: "Choose true or false.",
        explanation:
          "This is false. A reliable approach confirms the requirement, checks evidence and takes a proportionate action.",
        publicPayload: {},
        privateEvaluation: { correctOptionKey: "false" },
        options: [
          ["true", "True"],
          ["false", "False"],
        ],
      };
    case "scenario":
      return {
        key: "choose-action",
        type,
        prompt: `A learner needs to ${input.objective}. Which action should they choose first?`,
        instruction: "Choose the safest and most useful action.",
        explanation: `Choose the action that is specific, evidence-based and proportionate. ${input.strong}`,
        publicPayload: {},
        privateEvaluation: { correctOptionKeys: ["best"] },
        options: [
          ["best", input.strong],
          [
            "partial",
            "Act immediately with incomplete context and plan to correct the work later.",
          ],
          ["risky", input.weak],
        ],
      };
    case "ordering":
      return {
        key: "order-reliable-steps",
        type,
        prompt: `Put the reliable steps in order before you ${input.objective}.`,
        instruction: "Move every step into the strongest order.",
        explanation:
          "First confirm the requirement, then check the relevant evidence, and only then take the proportionate action.",
        publicPayload: {},
        privateEvaluation: { correctOrder: ["confirm", "check", "act"] },
        options: [
          ["confirm", "Confirm the requirement and intended outcome."],
          ["check", "Check the relevant evidence, constraints and risks."],
          ["act", "Take the clearest proportionate action and record the next step."],
        ],
      };
    case "matching":
      return {
        key: "match-evidence-actions",
        type,
        prompt: `Match each need with the action that best supports how to ${input.objective}.`,
        instruction: "Match every item once.",
        explanation:
          "Reliable work connects the requirement to clarification, evidence to verification, and risk to a proportionate action.",
        publicPayload: {
          left: [
            { key: "requirement", label: "The requirement is unclear." },
            { key: "evidence", label: "The available evidence may be incomplete." },
            { key: "risk", label: "The action could affect another person or outcome." },
          ],
          right: [
            { key: "clarify", label: "Ask a focused clarifying question." },
            { key: "verify", label: "Verify the source and missing details." },
            { key: "proportionate", label: "Choose a reversible, proportionate next step." },
          ],
        },
        privateEvaluation: {
          correctPairs: [
            { leftKey: "requirement", rightKey: "clarify" },
            { leftKey: "evidence", rightKey: "verify" },
            { leftKey: "risk", rightKey: "proportionate" },
          ],
        },
        options: [],
      };
    case "fill_blank":
      return {
        key: "complete-first-step",
        type,
        prompt: `Complete the sentence: Before I ${input.objective}, I should first ____ the requirement.`,
        instruction: "Enter one suitable word.",
        explanation:
          "Confirming or clarifying the requirement reduces avoidable errors before evidence is checked and action begins.",
        publicPayload: { placeholder: "Type one word", maxLength: 40 },
        privateEvaluation: {
          acceptedAnswers: ["confirm", "clarify", "check"],
          caseSensitive: false,
          trim: true,
          collapseWhitespace: true,
        },
        options: [],
      };
    case "short_response":
      return {
        key: "explain-reliable-approach",
        type,
        prompt: `In one or two sentences, explain how you would ${input.objective}.`,
        instruction: "Include the evidence you would check and the first action you would take.",
        explanation:
          "A strong answer names the requirement, evidence, proportionate action and an explicit boundary or next step.",
        publicPayload: {
          placeholder: "Write a concise evidence-based response",
          maxLength: 800,
          evaluationNotice:
            "Clearly strong or weak responses use a deterministic rubric. Borderline responses remain review-only.",
        },
        privateEvaluation: {
          policy: "deterministic_rubric_v1",
          minimumWords: 8,
          maximumWords: 120,
          passScore: 0.65,
          reviewBand: 0.15,
          uncertaintyMessage:
            "The response falls inside the rubric uncertainty band and is saved for review without an automatic score.",
          criteria: [
            {
              key: "requirement",
              label: "clear requirement or outcome",
              keywords: ["requirement", "goal", "outcome", "confirm", "clarify", "understand"],
              weight: 0.25,
              minimumKeywordMatches: 1,
            },
            {
              key: "evidence",
              label: "relevant evidence or verification",
              keywords: ["evidence", "source", "check", "verify", "example", "details", "facts"],
              weight: 0.25,
              minimumKeywordMatches: 1,
            },
            {
              key: "action",
              label: "proportionate first action",
              keywords: ["action", "step", "respond", "plan", "ask", "document", "apply"],
              weight: 0.25,
              minimumKeywordMatches: 1,
            },
            {
              key: "boundary",
              label: "boundary, risk or next step",
              keywords: ["risk", "privacy", "limit", "boundary", "safe", "next", "follow up"],
              weight: 0.25,
              minimumKeywordMatches: 1,
            },
          ],
        },
        options: [],
      };
  }
}

export function launchChallenges(
  input: Readonly<{
    objective: string;
    strong: string;
    weak: string;
    rotation: number;
  }>,
): readonly LaunchChallengeDefinition[] {
  const offset = ((input.rotation % formatOrder.length) + formatOrder.length) % formatOrder.length;
  return [0, 1, 2].map((step) => {
    const type = formatOrder[(offset + step) % formatOrder.length];
    if (!type) throw new Error("A reviewed launch challenge type could not be selected.");
    return definition(type, input);
  });
}
