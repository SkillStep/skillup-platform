export type LevelDefinition = readonly [title: string, objective: string];
export type ModuleDefinition = Readonly<{
  title: string;
  levels: readonly LevelDefinition[];
}>;
export type SkillDefinition = Readonly<{
  skillSlug: string;
  category: "career-readiness" | "language" | "digital-skills" | "business";
  modules: readonly ModuleDefinition[];
}>;

export const launchCategoryDefinitions = {
  "career-readiness": [
    "Career Readiness",
    "Build practical communication, interview and workplace habits for early career opportunities in Pakistan.",
  ],
  language: [
    "Language and Communication",
    "Practice clear everyday language for study, work, collaboration and professional communication.",
  ],
  "digital-skills": [
    "Digital Skills",
    "Use digital tools, AI and marketing methods safely, critically and with measurable outcomes.",
  ],
  business: [
    "Business and Freelancing",
    "Build practical commercial, client and delivery habits for independent and small-business work.",
  ],
} as const;

export const completeLaunchCurriculum: readonly SkillDefinition[] = [
  {
    skillSlug: "interview-workplace-communication",
    category: "career-readiness",
    modules: [
      {
        title: "Interview Evidence",
        levels: [
          [
            "Build a Situation Action Result Answer",
            "structure an interview example with context, action and result",
          ],
          [
            "Choose Relevant Evidence",
            "select an example that directly answers the interview question",
          ],
          [
            "Quantify Results Honestly",
            "describe outcomes with accurate and proportionate evidence",
          ],
          [
            "Explain Learning from Failure",
            "discuss a setback with accountability and improvement",
          ],
        ],
      },
      {
        title: "Professional Introductions",
        levels: [
          [
            "Write a Clear Professional Introduction",
            "introduce a current focus, relevant strength and intended value",
          ],
          ["Tailor an Introduction to the Role", "adapt an introduction to the employer and role"],
          [
            "Answer Tell Me About Yourself",
            "give a concise present-past-future interview response",
          ],
          ["Close an Interview Confidently", "close with interest, fit and a useful question"],
        ],
      },
      {
        title: "Workplace Messages",
        levels: [
          ["Write a Useful Status Update", "report progress, next action and risk clearly"],
          ["Ask for Clarification", "clarify an unclear task without creating delay"],
          ["Escalate a Blocker Early", "escalate a material blocker with evidence and options"],
          [
            "Follow Up Professionally",
            "send a polite follow-up with context and an actionable request",
          ],
        ],
      },
      {
        title: "Difficult Conversations",
        levels: [
          ["Give Specific Feedback", "give behavior-based feedback with impact and next step"],
          [
            "Receive Feedback Constructively",
            "respond to feedback with clarification and an improvement action",
          ],
          ["Disagree Respectfully", "challenge an idea while protecting working relationships"],
          ["Set a Work Boundary", "set a clear boundary while offering a workable alternative"],
        ],
      },
      {
        title: "Assessment and Next Steps",
        levels: [
          [
            "Diagnose a Weak Interview Answer",
            "identify missing evidence, relevance and result in an answer",
          ],
          ["Improve a Workplace Message", "edit a vague message into a concise actionable update"],
          [
            "Prepare an Interview Evidence Bank",
            "prepare reusable examples without memorizing scripts",
          ],
          [
            "Create a Communication Improvement Plan",
            "select a specific communication habit and measure improvement",
          ],
        ],
      },
    ],
  },
  {
    skillSlug: "practical-english-study-work",
    category: "language",
    modules: [
      {
        title: "Instructions and Clarification",
        levels: [
          [
            "Identify the Action in an Instruction",
            "identify the required action, object and deadline in an English instruction",
          ],
          [
            "Ask a Focused Clarifying Question",
            "ask for missing information in clear simple English",
          ],
          ["Confirm Understanding", "confirm a task in your own words"],
          ["Follow Multi Step Instructions", "sequence and complete multi-step instructions"],
        ],
      },
      {
        title: "Professional Messages",
        levels: [
          [
            "Write a Useful Subject Line",
            "write a concise subject line that states topic and action",
          ],
          ["Write a Concise Request", "make a polite request with context, action and timing"],
          ["Report a Problem Clearly", "describe a problem, impact and attempted solution"],
          ["Write a Polite Follow Up", "follow up without sounding demanding or vague"],
        ],
      },
      {
        title: "Study and Work Conversations",
        levels: [
          ["Introduce Yourself in a Group", "give a short relevant introduction in English"],
          ["Agree and Add Information", "agree with a point and add a useful contribution"],
          ["Disagree with Respect", "express a different view using clear respectful language"],
          ["Summarize a Discussion", "summarize decisions, actions and owners"],
        ],
      },
    ],
  },
  {
    skillSlug: "ai-tools-study-work",
    category: "digital-skills",
    modules: [
      {
        title: "Prompt Foundations",
        levels: [
          ["State a Clear Goal", "write an AI instruction with one clear outcome"],
          [
            "Provide Relevant Context",
            "supply enough context without exposing sensitive information",
          ],
          ["Specify an Output Format", "request a usable structure and length"],
          ["Iterate with Evidence", "improve a prompt using observed output problems"],
        ],
      },
      {
        title: "Verification and Quality",
        levels: [
          ["Separate Claims from Evidence", "identify AI claims that require verification"],
          ["Check Numbers and Calculations", "verify calculations and quantitative claims"],
          ["Detect Missing Context and Bias", "review whose perspective or context is missing"],
          ["Use a Quality Checklist", "approve AI output only after a repeatable review"],
        ],
      },
      {
        title: "Safe AI Workflows",
        levels: [
          [
            "Protect Private Information",
            "identify information that should not be sent to an AI provider",
          ],
          [
            "Keep Humans in Important Decisions",
            "place human approval at high-impact decision points",
          ],
          ["Record AI Use and Sources", "keep a useful audit trail for AI-assisted work"],
          ["Control Cost and Failure", "design a bounded AI workflow with fallback behavior"],
        ],
      },
    ],
  },
  {
    skillSlug: "freelancing-foundations",
    category: "business",
    modules: [
      {
        title: "Offer and Client Brief",
        levels: [
          [
            "Define a Specific Service",
            "describe a service by client problem, deliverable and boundary",
          ],
          [
            "Read a Client Brief",
            "extract goals, deliverables, constraints and unanswered questions",
          ],
          [
            "Ask High Value Discovery Questions",
            "ask questions that reduce delivery and commercial risk",
          ],
          ["Decide Whether the Project Fits", "evaluate capability, capacity, risk and client fit"],
        ],
      },
      {
        title: "Scope and Commercials",
        levels: [
          ["Write a Clear Scope", "write deliverables, acceptance criteria and boundaries"],
          ["Estimate with Assumptions", "estimate effort while making dependencies visible"],
          ["Define Revisions and Change Control", "separate included revisions from new scope"],
          [
            "Use Milestones and Payment Protection",
            "structure payment around verified delivery stages",
          ],
        ],
      },
      {
        title: "Delivery and Client Safety",
        levels: [
          ["Send Useful Progress Updates", "communicate progress, decisions, risks and next steps"],
          ["Handle Feedback and Disagreement", "turn feedback into an agreed actionable change"],
          [
            "Deliver a Professional Handover",
            "provide verified files, instructions and ownership records",
          ],
          ["Recognize Freelancing Scams", "identify unsafe payment, identity and access requests"],
        ],
      },
    ],
  },
  {
    skillSlug: "digital-marketing-foundations",
    category: "digital-skills",
    modules: [
      {
        title: "Audience and Offer",
        levels: [
          [
            "Define a Useful Audience Segment",
            "describe an audience by situation, need and behavior",
          ],
          [
            "Identify the Real Customer Problem",
            "distinguish a customer problem from a product feature",
          ],
          ["Write a Clear Value Proposition", "connect audience, outcome and differentiator"],
          ["Choose a Specific Call to Action", "match one call to action to the audience stage"],
        ],
      },
      {
        title: "Funnel and Content",
        levels: [
          [
            "Map the Customer Journey",
            "map awareness, consideration, conversion and retention needs",
          ],
          ["Set a Content Objective", "give each content item one measurable purpose"],
          [
            "Match Channel to Behavior",
            "select a channel based on audience behavior and content format",
          ],
          ["Build a Testable Content Plan", "plan themes, formats, cadence and hypotheses"],
        ],
      },
      {
        title: "Measurement and Improvement",
        levels: [
          ["Choose a Decision Useful KPI", "select a metric connected to a business decision"],
          [
            "Use Clean Campaign Attribution",
            "use consistent campaign parameters and source records",
          ],
          [
            "Run a Controlled Experiment",
            "test one meaningful change with a clear success measure",
          ],
          [
            "Report Insight and Next Action",
            "turn results into evidence, interpretation and action",
          ],
        ],
      },
    ],
  },
] as const;
