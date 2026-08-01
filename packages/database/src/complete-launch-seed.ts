import { createHash } from "node:crypto";

import { createDatabaseClient, requireDatabaseUrl } from "./index.js";
import { launchCatalogSeed } from "./seed-data.js";

type LevelBlueprint = Readonly<{
  title: string;
  objective: string;
  bestPractice: string;
  commonMistake: string;
}>;

type ModuleBlueprint = Readonly<{
  title: string;
  levels: readonly LevelBlueprint[];
}>;

type CurriculumBlueprint = Readonly<{
  skillSlug: string;
  category: "career-readiness" | "language" | "digital-skills" | "business";
  modules: readonly ModuleBlueprint[];
}>;

const reviewedAt = new Date("2026-08-01T00:00:00.000Z");

const curricula: readonly CurriculumBlueprint[] = [
  {
    skillSlug: "interview-workplace-communication",
    category: "career-readiness",
    modules: [
      {
        title: "Interview Evidence",
        levels: [
          { title: "Build a Situation Action Result Answer", objective: "structure an interview example with context, action and result", bestPractice: "Give brief context, describe your own action and close with a specific result.", commonMistake: "List positive qualities without a real example or result." },
          { title: "Choose Relevant Evidence", objective: "select an example that directly answers the interview question", bestPractice: "Choose the closest recent example and explain why it demonstrates the requested skill.", commonMistake: "Use an impressive story that does not answer the question being asked." },
          { title: "Quantify Results Honestly", objective: "describe outcomes with accurate and proportionate evidence", bestPractice: "Use a verified number, timeframe or observable outcome and clarify your contribution.", commonMistake: "Invent a percentage or take full credit for a team result." },
          { title: "Explain Learning from Failure", objective: "discuss a setback with accountability and improvement", bestPractice: "Own the decision, explain the correction and show the changed behavior that followed.", commonMistake: "Blame another person or present a disguised strength as the failure." },
        ],
      },
      {
        title: "Professional Introductions",
        levels: [
          { title: "Write a Clear Professional Introduction", objective: "introduce your current focus, relevant strength and intended value", bestPractice: "State who you are, the work you can do and the problem you want to help solve.", commonMistake: "Recite every detail from your education and personal history." },
          { title: "Tailor an Introduction to the Role", objective: "adapt an introduction to the employer and role", bestPractice: "Connect one relevant capability and example to the role's stated need.", commonMistake: "Use the same generic introduction for every opportunity." },
          { title: "Answer Tell Me About Yourself", objective: "give a concise present-past-future interview response", bestPractice: "Summarize your current direction, one relevant experience and why this opportunity is the next step.", commonMistake: "Tell an unstructured life story with no connection to the position." },
          { title: "Close an Interview Confidently", objective: "close with interest, fit and a useful question", bestPractice: "Reconfirm interest, summarize the strongest fit and ask a role-specific question.", commonMistake: "End only by asking when the salary will increase." },
        ],
      },
      {
        title: "Workplace Messages",
        levels: [
          { title: "Write a Useful Status Update", objective: "report progress, next action and risk clearly", bestPractice: "State what is complete, what happens next and any decision or help needed.", commonMistake: "Say that work is ongoing without dates, outcomes or blockers." },
          { title: "Ask for Clarification", objective: "clarify an unclear task without creating delay", bestPractice: "Repeat your understanding and ask one specific question about the missing requirement.", commonMistake: "Start work based on assumptions and reveal the misunderstanding at delivery." },
          { title: "Escalate a Blocker Early", objective: "escalate a material blocker with evidence and options", bestPractice: "Explain the impact, what you tried and two realistic options for a decision.", commonMistake: "Wait until the deadline and report only that the task could not be completed." },
          { title: "Follow Up Professionally", objective: "send a polite follow-up with context and an actionable request", bestPractice: "Reference the earlier request, state the needed action and give a reasonable response date.", commonMistake: "Send repeated messages saying only reminder or urgent." },
        ],
      },
      {
        title: "Difficult Conversations",
        levels: [
          { title: "Give Specific Feedback", objective: "give behavior-based feedback with impact and next step", bestPractice: "Describe the observed behavior, its impact and the requested change without attacking the person.", commonMistake: "Use labels such as careless or unprofessional without a specific example." },
          { title: "Receive Feedback Constructively", objective: "respond to feedback with clarification and an improvement action", bestPractice: "Listen, summarize the concern, ask for an example and agree on a measurable next step.", commonMistake: "Defend every detail before confirming what the other person experienced." },
          { title: "Disagree Respectfully", objective: "challenge an idea while protecting working relationships", bestPractice: "Acknowledge the shared goal, present evidence and propose a testable alternative.", commonMistake: "Dismiss the proposal or question the other person's competence." },
          { title: "Set a Work Boundary", objective: "set a clear boundary while offering a workable alternative", bestPractice: "State the constraint, the impact and what you can deliver by an agreed time.", commonMistake: "Accept impossible work silently or refuse without explaining available options." },
        ],
      },
      {
        title: "Assessment and Next Steps",
        levels: [
          { title: "Diagnose a Weak Interview Answer", objective: "identify missing evidence, relevance and result in an answer", bestPractice: "Check whether the response answers the question, names an action and provides a credible outcome.", commonMistake: "Judge the answer only by confidence or vocabulary." },
          { title: "Improve a Workplace Message", objective: "edit a vague message into a concise actionable update", bestPractice: "Add the outcome, owner, timing and decision needed while removing unnecessary detail.", commonMistake: "Make the message longer without adding an action or deadline." },
          { title: "Prepare an Interview Evidence Bank", objective: "prepare reusable examples without memorizing scripts", bestPractice: "Record several verified examples by skill, action, result and learning, then adapt them to each question.", commonMistake: "Memorize one answer word for word and force it into unrelated questions." },
          { title: "Create a Communication Improvement Plan", objective: "select a specific communication habit and measure improvement", bestPractice: "Choose one behavior, practice it in real situations and review evidence weekly.", commonMistake: "Set a broad goal to become more confident without a practice or measure." },
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
          { title: "Identify the Action in an Instruction", objective: "identify the required action, object and deadline in an English instruction", bestPractice: "Underline the action verb, the expected output and the date or condition.", commonMistake: "Focus on unfamiliar words and miss the action that must be completed." },
          { title: "Ask a Focused Clarifying Question", objective: "ask for missing information in clear simple English", bestPractice: "State what you understand and ask one direct question about the missing detail.", commonMistake: "Say I do not understand without identifying which detail is unclear." },
          { title: "Confirm Understanding", objective: "confirm a task in your own words", bestPractice: "Restate the output, deadline and any agreed constraint, then request confirmation.", commonMistake: "Reply okay even when the required output is still uncertain." },
          { title: "Follow Multi Step Instructions", objective: "sequence and complete multi-step instructions", bestPractice: "Number the steps, check dependencies and mark each completed action.", commonMistake: "Begin the easiest step without checking the required order." },
        ],
      },
      {
        title: "Professional Messages",
        levels: [
          { title: "Write a Useful Subject Line", objective: "write a concise subject line that states topic and action", bestPractice: "Use the project or topic plus the requested action or deadline.", commonMistake: "Use hello, urgent or update as the entire subject." },
          { title: "Write a Concise Request", objective: "make a polite request with context, action and timing", bestPractice: "Give one sentence of context, state the request and include a reasonable date.", commonMistake: "Use indirect language so the reader cannot tell what action is needed." },
          { title: "Report a Problem Clearly", objective: "describe a problem, impact and attempted solution", bestPractice: "State what happened, who or what is affected and what you already tried.", commonMistake: "Say it is not working without evidence or context." },
          { title: "Write a Polite Follow Up", objective: "follow up without sounding demanding or vague", bestPractice: "Reference the previous message, repeat the action and explain the timing need.", commonMistake: "Send question marks or multiple urgent reminders without context." },
        ],
      },
      {
        title: "Study and Work Conversations",
        levels: [
          { title: "Introduce Yourself in a Group", objective: "give a short relevant introduction in English", bestPractice: "Share your name, current role or study focus and one relevant interest.", commonMistake: "Apologize repeatedly for your English before introducing yourself." },
          { title: "Agree and Add Information", objective: "agree with a point and add a useful contribution", bestPractice: "Acknowledge the point, add a reason or example and connect it to the discussion.", commonMistake: "Repeat exactly what another person said without adding value." },
          { title: "Disagree with Respect", objective: "express a different view using clear respectful language", bestPractice: "Acknowledge the other view and explain your alternative with a reason.", commonMistake: "Say you are wrong or reject the idea without explanation." },
          { title: "Summarize a Discussion", objective: "summarize decisions, actions and owners", bestPractice: "State the decision, each action, responsible person and due date.", commonMistake: "Repeat the whole conversation instead of recording the outcome." },
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
          { title: "State a Clear Goal", objective: "write an AI instruction with one clear outcome", bestPractice: "Name the task, intended reader and exact output you need.", commonMistake: "Ask the model to make it better without defining better or the output." },
          { title: "Provide Relevant Context", objective: "supply enough context without exposing sensitive information", bestPractice: "Include the purpose, constraints and non-sensitive source material needed for the task.", commonMistake: "Paste private records or provide no context at all." },
          { title: "Specify an Output Format", objective: "request a usable structure and length", bestPractice: "Specify headings, fields, length and any required examples.", commonMistake: "Request a detailed response and then expect a specific table or schema." },
          { title: "Iterate with Evidence", objective: "improve a prompt using observed output problems", bestPractice: "Identify one output defect, add a precise constraint and test again.", commonMistake: "Repeat the same prompt and expect a different reliable result." },
        ],
      },
      {
        title: "Verification and Quality",
        levels: [
          { title: "Separate Claims from Evidence", objective: "identify AI claims that require verification", bestPractice: "Mark factual, numerical and source claims and verify them against an authoritative source.", commonMistake: "Trust a fluent answer because it sounds confident and detailed." },
          { title: "Check Numbers and Calculations", objective: "verify calculations and quantitative claims", bestPractice: "Recalculate important numbers and inspect units, assumptions and date ranges.", commonMistake: "Copy a calculated result without checking the inputs or units." },
          { title: "Detect Missing Context and Bias", objective: "review whose perspective or context is missing", bestPractice: "Ask what assumptions, groups, locations or constraints the answer excludes.", commonMistake: "Treat one generalized answer as equally valid for every user or country." },
          { title: "Use a Quality Checklist", objective: "approve AI output only after a repeatable review", bestPractice: "Check accuracy, completeness, safety, tone, sources and required format before use.", commonMistake: "Review only spelling and grammar before publishing the output." },
        ],
      },
      {
        title: "Safe AI Workflows",
        levels: [
          { title: "Protect Private Information", objective: "identify information that should not be sent to an AI provider", bestPractice: "Remove credentials, identity records, confidential documents and unnecessary personal details.", commonMistake: "Assume a paid AI account makes every confidential input safe to upload." },
          { title: "Keep Humans in Important Decisions", objective: "place human approval at high-impact decision points", bestPractice: "Use AI for drafting or analysis and require an accountable person to approve consequential decisions.", commonMistake: "Allow AI output to automatically approve payments, access or disciplinary actions." },
          { title: "Record AI Use and Sources", objective: "keep a useful audit trail for AI-assisted work", bestPractice: "Record the task, model, source material, review decision and final human edits.", commonMistake: "Publish generated material without knowing which source or prompt produced it." },
          { title: "Control Cost and Failure", objective: "design a bounded AI workflow with fallback behavior", bestPractice: "Set token, request and budget limits and define what happens when the provider fails.", commonMistake: "Retry indefinitely or send the same expensive request without a cost ceiling." },
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
          { title: "Define a Specific Service", objective: "describe a service by client problem, deliverable and boundary", bestPractice: "Name the problem solved, the deliverable and what is not included.", commonMistake: "Offer every digital service without a clear outcome or specialization." },
          { title: "Read a Client Brief", objective: "extract goals, deliverables, constraints and unanswered questions", bestPractice: "Separate stated requirements, assumptions, risks and questions before estimating.", commonMistake: "Price immediately from the project title without reading the full brief." },
          { title: "Ask High Value Discovery Questions", objective: "ask questions that reduce delivery and commercial risk", bestPractice: "Ask about users, success criteria, existing assets, approvals, integrations and deadlines.", commonMistake: "Ask only for the client's budget before understanding the work." },
          { title: "Decide Whether the Project Fits", objective: "evaluate capability, capacity, risk and client fit", bestPractice: "Compare requirements with proven skills, available time, dependencies and payment risk.", commonMistake: "Accept every project and plan to learn all critical skills after kickoff." },
        ],
      },
      {
        title: "Scope and Commercials",
        levels: [
          { title: "Write a Clear Scope", objective: "write deliverables, acceptance criteria and boundaries", bestPractice: "List each output, included revision cycle, acceptance evidence and exclusion.", commonMistake: "Promise a complete solution without defining what completion means." },
          { title: "Estimate with Assumptions", objective: "estimate effort while making dependencies visible", bestPractice: "Break work into tasks, record assumptions and add contingency for known risk.", commonMistake: "Give one optimistic number with no assumptions or dependency allowance." },
          { title: "Define Revisions and Change Control", objective: "separate included revisions from new scope", bestPractice: "Define revision rounds and price or reschedule requests that change approved requirements.", commonMistake: "Treat every new idea as an unlimited free revision." },
          { title: "Use Milestones and Payment Protection", objective: "structure payment around verified delivery stages", bestPractice: "Use a deposit or funded milestone, clear acceptance and controlled source handover.", commonMistake: "Deliver all editable source files before any payment protection exists." },
        ],
      },
      {
        title: "Delivery and Client Safety",
        levels: [
          { title: "Send Useful Progress Updates", objective: "communicate progress, decisions, risks and next steps", bestPractice: "Show completed evidence, upcoming work, blockers and decisions needed from the client.", commonMistake: "Disappear during production and contact the client only at the deadline." },
          { title: "Handle Feedback and Disagreement", objective: "turn feedback into an agreed actionable change", bestPractice: "Confirm the underlying concern, propose options and record the approved direction.", commonMistake: "Make every requested change immediately without checking scope or impact." },
          { title: "Deliver a Professional Handover", objective: "provide verified files, instructions and ownership records", bestPractice: "Use a checklist for files, credentials, documentation, backups and client acceptance.", commonMistake: "Send a folder link without confirming versions, access or instructions." },
          { title: "Recognize Freelancing Scams", objective: "identify unsafe payment, identity and access requests", bestPractice: "Use trusted payment channels, verify identity and never share credentials or pay to receive work.", commonMistake: "Install unknown software or share an OTP because the client says it is required." },
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
          { title: "Define a Useful Audience Segment", objective: "describe an audience by situation, need and behavior", bestPractice: "Use evidence to define who has the problem, when it appears and how they currently respond.", commonMistake: "Define the target audience as everyone who uses social media." },
          { title: "Identify the Real Customer Problem", objective: "distinguish a customer problem from a product feature", bestPractice: "Describe the customer's desired progress and the friction preventing it.", commonMistake: "Assume the problem is that customers do not know the product features." },
          { title: "Write a Clear Value Proposition", objective: "connect audience, outcome and differentiator", bestPractice: "State who it helps, the valuable outcome and the credible reason to choose it.", commonMistake: "Use claims such as best quality and number one without evidence." },
          { title: "Choose a Specific Call to Action", objective: "match one call to action to the audience stage", bestPractice: "Ask for one measurable next step that fits the user's current intent.", commonMistake: "Place several competing calls to action in the same message." },
        ],
      },
      {
        title: "Funnel and Content",
        levels: [
          { title: "Map the Customer Journey", objective: "map awareness, consideration, conversion and retention needs", bestPractice: "Identify the question, proof and next action required at each stage.", commonMistake: "Show the same direct sales message to every person at every stage." },
          { title: "Set a Content Objective", objective: "give each content item one measurable purpose", bestPractice: "Choose whether the content should educate, build proof, generate action or retain customers.", commonMistake: "Create content only to keep the page active without a user objective." },
          { title: "Match Channel to Behavior", objective: "select a channel based on audience behavior and content format", bestPractice: "Use evidence about where the audience searches, compares and acts.", commonMistake: "Choose a channel only because it is currently popular." },
          { title: "Build a Testable Content Plan", objective: "plan themes, formats, cadence and hypotheses", bestPractice: "Link each content theme to an audience question, funnel stage and measurable hypothesis.", commonMistake: "Plan a calendar of unrelated posts with no learning goal." },
        ],
      },
      {
        title: "Measurement and Improvement",
        levels: [
          { title: "Choose a Decision Useful KPI", objective: "select a metric connected to a business decision", bestPractice: "Choose a metric that shows progress toward the intended user action or commercial outcome.", commonMistake: "Use follower count as the main success metric for every campaign." },
          { title: "Use Clean Campaign Attribution", objective: "use consistent campaign parameters and source records", bestPractice: "Define a naming convention, tag links and verify analytics before launch.", commonMistake: "Change campaign names and links without preserving comparable attribution." },
          { title: "Run a Controlled Experiment", objective: "test one meaningful change with a clear success measure", bestPractice: "State a hypothesis, change one variable and define the decision threshold before running the test.", commonMistake: "Change audience, creative, offer and landing page at the same time." },
          { title: "Report Insight and Next Action", objective: "turn results into evidence, interpretation and action", bestPractice: "Report what changed, why it may have changed, confidence limits and the next test or decision.", commonMistake: "Present charts and percentages without explaining what decision they support." },
        ],
      },
    ],
  },
] as const;

const categoryDefinitions = {
  "career-readiness": {
    title: "Career Readiness",
    summary: "Build practical communication, interview and workplace habits for early career opportunities in Pakistan.",
  },
  language: {
    title: "Language and Communication",
    summary: "Practice clear everyday language for study, work, collaboration and professional communication.",
  },
  "digital-skills": {
    title: "Digital Skills",
    summary: "Use digital tools, AI and marketing methods safely, critically and with measurable outcomes.",
  },
  business: {
    title: "Business and Freelancing",
    summary: "Build practical commercial, client and delivery habits for independent and small-business work.",
  },
} as const;

function slug(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function uuid(key: string): string {
  const raw = createHash("sha256").update(`skillup-launch:${key}`).digest("hex").slice(0, 32);
  const chars = raw.split("");
  chars[12] = "4";
  chars[16] = "8";
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function titleSummary(title: string, purpose: string): string {
  return `Practice ${title.toLocaleLowerCase("en-US")} through concise examples and decisions that help learners ${purpose}.`;
}

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-complete-launch-seed",
  maxConnections: 2,
});

const database = await client.pool.connect();
try {
  await database.query("begin");

  for (const [categoryIndex, [categorySlug, category]] of Object.entries(categoryDefinitions).entries()) {
    const categoryId = uuid(`category:${categorySlug}`);
    const categoryVersionId = uuid(`category:${categorySlug}:v1`);
    await database.query(
      `insert into skill_categories (id, slug, default_locale, sort_order)
       values ($1, $2, 'en', $3)
       on conflict (slug) do update set sort_order = excluded.sort_order`,
      [categoryId, categorySlug, categoryIndex + 1],
    );
    await database.query(
      `insert into skill_category_versions
        (id, category_id, version, locale, title, summary, state, index_policy, reviewed_at, published_at)
       values ($1, $2, 1, 'en', $3, $4, 'published', 'index', $5, $5)
       on conflict (category_id, version, locale) do update
         set title = excluded.title, summary = excluded.summary, state = 'published',
             index_policy = 'index', reviewed_at = excluded.reviewed_at,
             published_at = excluded.published_at`,
      [categoryVersionId, categoryId, category.title, category.summary, reviewedAt],
    );
  }

  for (const curriculum of curricula) {
    const catalog = launchCatalogSeed.find((item) => item.skill.slug === curriculum.skillSlug);
    if (!catalog) throw new Error(`Missing launch catalog entry for ${curriculum.skillSlug}.`);
    const categoryId = uuid(`category:${curriculum.category}`);

    await database.query(`update skills set status = 'published', updated_at = $2 where id = $1`, [
      catalog.skill.id,
      reviewedAt,
    ]);
    await database.query(
      `update skill_versions
          set status = 'published', reviewed_at = $2, published_at = $2
        where id = $1`,
      [catalog.skill.versionId, reviewedAt],
    );
    await database.query(
      `update learning_paths set status = 'published', updated_at = $2 where id = $1`,
      [catalog.path.id, reviewedAt],
    );
    await database.query(
      `update learning_path_versions
          set status = 'published', reviewed_at = $2, published_at = $2
        where id = $1`,
      [catalog.path.versionId, reviewedAt],
    );
    await database.query(
      `insert into skill_category_memberships (category_id, skill_id, sort_order)
       values ($1, $2, $3)
       on conflict (category_id, skill_id) do update set sort_order = excluded.sort_order`,
      [categoryId, catalog.skill.id, catalog.path.sortOrder],
    );

    for (const [moduleIndex, module] of curriculum.modules.entries()) {
      const moduleSlug = slug(module.title);
      const moduleId = uuid(`${curriculum.skillSlug}:module:${moduleSlug}`);
      const moduleVersionId = uuid(`${curriculum.skillSlug}:module:${moduleSlug}:v1`);
      await database.query(
        `insert into learning_modules (id, learning_path_id, slug, sort_order)
         values ($1, $2, $3, $4)
         on conflict (learning_path_id, slug) do update set sort_order = excluded.sort_order`,
        [moduleId, catalog.path.id, moduleSlug, moduleIndex + 10],
      );
      await database.query(
        `insert into learning_module_versions
          (id, module_id, learning_path_version_id, version, locale, title, summary,
           state, index_policy, reviewed_at, published_at)
         values ($1, $2, $3, 1, 'en', $4, $5, 'published', 'noindex', $6, $6)
         on conflict (module_id, version, locale) do update
           set title = excluded.title, summary = excluded.summary, state = 'published',
               reviewed_at = excluded.reviewed_at, published_at = excluded.published_at`,
        [
          moduleVersionId,
          moduleId,
          catalog.path.versionId,
          module.title,
          titleSummary(module.title, "apply the skill in realistic study and work situations"),
          reviewedAt,
        ],
      );

      for (const [levelIndex, level] of module.levels.entries()) {
        const levelSlug = slug(level.title);
        const lessonSlug = `${levelSlug}-lesson`;
        const lessonId = uuid(`${curriculum.skillSlug}:lesson:${lessonSlug}`);
        const lessonVersionId = uuid(`${curriculum.skillSlug}:lesson:${lessonSlug}:v1`);
        const levelId = uuid(`${curriculum.skillSlug}:level:${levelSlug}`);
        const levelVersionId = uuid(`${curriculum.skillSlug}:level:${levelSlug}:v1`);
        const objectiveId = uuid(`${curriculum.skillSlug}:objective:${levelSlug}`);
        const sourceId = uuid(`${curriculum.skillSlug}:source:${levelSlug}`);

        await database.query(
          `insert into lessons (id, module_id, slug, sort_order)
           values ($1, $2, $3, $4)
           on conflict (module_id, slug) do update set sort_order = excluded.sort_order`,
          [lessonId, moduleId, lessonSlug, levelIndex + 1],
        );
        await database.query(
          `insert into lesson_versions
            (id, lesson_id, module_version_id, version, locale, title, summary,
             estimated_minutes, state, index_policy, reviewed_at, published_at)
           values ($1, $2, $3, 1, 'en', $4, $5, 8, 'published', 'noindex', $6, $6)
           on conflict (lesson_id, version, locale) do update
             set title = excluded.title, summary = excluded.summary, state = 'published',
                 reviewed_at = excluded.reviewed_at, published_at = excluded.published_at`,
          [lessonVersionId, lessonId, moduleVersionId, level.title, titleSummary(level.title, level.objective), reviewedAt],
        );
        await database.query(
          `insert into levels (id, lesson_id, slug, sort_order)
           values ($1, $2, $3, 1)
           on conflict (lesson_id, slug) do nothing`,
          [levelId, lessonId, levelSlug],
        );
        await database.query(
          `insert into level_versions
            (id, level_id, lesson_version_id, version, locale, title, public_summary,
             instructions, estimated_minutes, state, index_policy, reviewed_at, published_at)
           values ($1, $2, $3, 1, 'en', $4, $5, $6, 6, 'published', 'noindex', $7, $7)
           on conflict (level_id, version, locale) do update
             set title = excluded.title, public_summary = excluded.public_summary,
                 instructions = excluded.instructions, state = 'published',
                 reviewed_at = excluded.reviewed_at, published_at = excluded.published_at`,
          [
            levelVersionId,
            levelId,
            lessonVersionId,
            level.title,
            `Practice how to ${level.objective} and distinguish a strong action from a common but unreliable approach.`,
            "Complete three short challenges. Use the explanation after each answer to identify the evidence, action and boundary that make the stronger choice reliable.",
            reviewedAt,
          ],
        );
        await database.query(
          `insert into learning_objectives
            (id, level_version_id, code, statement, assessable, sort_order)
           values ($1, $2, $3, $4, true, 1)
           on conflict (level_version_id, code) do update set statement = excluded.statement`,
          [
            objectiveId,
            levelVersionId,
            `${curriculum.skillSlug.split("-").map((part) => part[0]).join("").toUpperCase()}_${String(moduleIndex + 1).padStart(2, "0")}_${String(levelIndex + 1).padStart(2, "0")}`,
            `The learner can ${level.objective}.`,
          ],
        );
        await database.query(
          `insert into content_source_references
            (id, level_version_id, kind, title, locator, sort_order)
           values ($1, $2, 'internal_editorial', $3, $4, 1)
           on conflict (id) do nothing`,
          [
            sourceId,
            levelVersionId,
            `SkillUp reviewed ${catalog.skill.title} launch curriculum`,
            `${module.title} / ${level.title}`,
          ],
        );

        const challenges = [
          {
            key: "best-practice",
            type: "multiple_choice",
            prompt: `Which response best demonstrates how to ${level.objective}?`,
            explanation: `The stronger response is specific, proportionate and actionable: ${level.bestPractice}`,
            publicPayload: { selectionLimit: 1 },
            privateEvaluation: { correctOptionKeys: ["best"] },
            options: [
              ["best", level.bestPractice],
              ["mistake", level.commonMistake],
              ["vague", "Use a broad confident statement without checking the requirement or evidence."],
            ],
          },
          {
            key: "check-misconception",
            type: "true_false",
            prompt: `True or false: ${level.commonMistake}`,
            explanation: `This is false. A reliable approach is: ${level.bestPractice}`,
            publicPayload: {},
            privateEvaluation: { correctOptionKey: "false" },
            options: [
              ["true", "True"],
              ["false", "False"],
            ],
          },
          {
            key: "choose-action",
            type: "scenario",
            prompt: `A learner needs to ${level.objective}. Which action should they choose first?`,
            explanation: `Choose the action that is clear, evidence-based and safe: ${level.bestPractice}`,
            publicPayload: {},
            privateEvaluation: { correctOptionKeys: ["best"] },
            options: [
              ["best", level.bestPractice],
              ["partial", "Act immediately with incomplete context and plan to correct the work later."],
              ["risky", level.commonMistake],
            ],
          },
        ] as const;

        for (const [challengeIndex, challenge] of challenges.entries()) {
          const challengeSlug = `${levelSlug}-${challenge.key}`;
          const challengeId = uuid(`${curriculum.skillSlug}:challenge:${challengeSlug}`);
          const challengeVersionId = uuid(`${curriculum.skillSlug}:challenge:${challengeSlug}:v1`);
          await database.query(
            `insert into challenges (id, level_id, slug, sort_order)
             values ($1, $2, $3, $4)
             on conflict (level_id, slug) do update set sort_order = excluded.sort_order`,
            [challengeId, levelId, challengeSlug, challengeIndex + 1],
          );
          await database.query(
            `insert into challenge_versions
              (id, challenge_id, level_version_id, version, locale, type, prompt,
               instruction, explanation, public_payload, points, state, reviewed_at, published_at)
             values ($1, $2, $3, 1, 'en', $4, $5, $6, $7, $8::jsonb, 10,
                     'published', $9, $9)
             on conflict (challenge_id, version, locale) do update
               set prompt = excluded.prompt, instruction = excluded.instruction,
                   explanation = excluded.explanation, public_payload = excluded.public_payload,
                   state = 'published', reviewed_at = excluded.reviewed_at,
                   published_at = excluded.published_at`,
            [
              challengeVersionId,
              challengeId,
              levelVersionId,
              challenge.type,
              challenge.prompt,
              challenge.type === "true_false" ? "Choose true or false." : "Choose the strongest answer.",
              challenge.explanation,
              JSON.stringify(challenge.publicPayload),
              reviewedAt,
            ],
          );
          for (const [optionIndex, option] of challenge.options.entries()) {
            await database.query(
              `insert into challenge_answer_options
                (id, challenge_version_id, option_key, label, sort_order)
               values ($1, $2, $3, $4, $5)
               on conflict (challenge_version_id, option_key) do update
                 set label = excluded.label, sort_order = excluded.sort_order`,
              [
                uuid(`${curriculum.skillSlug}:option:${challengeSlug}:${option[0]}`),
                challengeVersionId,
                option[0],
                option[1],
                optionIndex + 1,
              ],
            );
          }
          await database.query(
            `insert into challenge_evaluations
              (challenge_version_id, evaluator, private_evaluation, updated_at)
             values ($1, 'deterministic_v1', $2::jsonb, $3)
             on conflict (challenge_version_id) do update
               set private_evaluation = excluded.private_evaluation, updated_at = excluded.updated_at`,
            [challengeVersionId, JSON.stringify(challenge.privateEvaluation), reviewedAt],
          );
          await database.query(
            `insert into content_publication_records
              (entity_type, entity_version_id, state, index_policy, canonical_path,
               reviewed_at, published_at, updated_at)
             select 'challenge_version', $1, 'published', 'noindex', $2, $3, $3, $3
             where not exists (
               select 1 from content_publication_records
                where entity_type = 'challenge_version' and entity_version_id = $1
             )`,
            [challengeVersionId, `/en/learn/${catalog.path.slug}/${moduleSlug}/${lessonSlug}/${levelSlug}`, reviewedAt],
          );
        }

        await database.query(
          `insert into content_publication_records
            (entity_type, entity_version_id, state, index_policy, canonical_path,
             reviewed_at, published_at, updated_at)
           select 'level_version', $1, 'published', 'noindex', $2, $3, $3, $3
           where not exists (
             select 1 from content_publication_records
              where entity_type = 'level_version' and entity_version_id = $1
           )`,
          [levelVersionId, `/en/learn/${catalog.path.slug}/${moduleSlug}/${lessonSlug}/${levelSlug}`, reviewedAt],
        );
      }
    }
  }

  await database.query("commit");
  const totalLevels = curricula.reduce(
    (sum, curriculum) => sum + curriculum.modules.reduce((moduleSum, module) => moduleSum + module.levels.length, 0),
    0,
  );
  console.log(`Complete SkillUp launch curriculum is present (${curricula.length} skills, ${totalLevels} levels, ${totalLevels * 3} challenges).`);
} catch (error) {
  await database.query("rollback").catch(() => undefined);
  throw error;
} finally {
  database.release();
  await client.close();
}
