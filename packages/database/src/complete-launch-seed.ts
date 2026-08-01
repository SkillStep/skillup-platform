import { createHash } from "node:crypto";

import { createDatabaseClient, requireDatabaseUrl } from "./index.js";
import { launchCatalogSeed } from "./seed-data.js";

type LevelDefinition = readonly [title: string, objective: string];
type ModuleDefinition = Readonly<{
  title: string;
  levels: readonly LevelDefinition[];
}>;
type SkillDefinition = Readonly<{
  skillSlug: string;
  category: "career-readiness" | "language" | "digital-skills" | "business";
  modules: readonly ModuleDefinition[];
}>;

const reviewedAt = new Date("2026-08-01T00:00:00.000Z");

const skillDefinitions: readonly SkillDefinition[] = [
  {
    skillSlug: "interview-workplace-communication",
    category: "career-readiness",
    modules: [
      {
        title: "Interview Evidence",
        levels: [
          ["Build a Situation Action Result Answer", "structure an interview example with context, action and result"],
          ["Choose Relevant Evidence", "select an example that directly answers the interview question"],
          ["Quantify Results Honestly", "describe outcomes with accurate and proportionate evidence"],
          ["Explain Learning from Failure", "discuss a setback with accountability and improvement"],
        ],
      },
      {
        title: "Professional Introductions",
        levels: [
          ["Write a Clear Professional Introduction", "introduce a current focus, relevant strength and intended value"],
          ["Tailor an Introduction to the Role", "adapt an introduction to the employer and role"],
          ["Answer Tell Me About Yourself", "give a concise present-past-future interview response"],
          ["Close an Interview Confidently", "close with interest, fit and a useful question"],
        ],
      },
      {
        title: "Workplace Messages",
        levels: [
          ["Write a Useful Status Update", "report progress, next action and risk clearly"],
          ["Ask for Clarification", "clarify an unclear task without creating delay"],
          ["Escalate a Blocker Early", "escalate a material blocker with evidence and options"],
          ["Follow Up Professionally", "send a polite follow-up with context and an actionable request"],
        ],
      },
      {
        title: "Difficult Conversations",
        levels: [
          ["Give Specific Feedback", "give behavior-based feedback with impact and next step"],
          ["Receive Feedback Constructively", "respond to feedback with clarification and an improvement action"],
          ["Disagree Respectfully", "challenge an idea while protecting working relationships"],
          ["Set a Work Boundary", "set a clear boundary while offering a workable alternative"],
        ],
      },
      {
        title: "Assessment and Next Steps",
        levels: [
          ["Diagnose a Weak Interview Answer", "identify missing evidence, relevance and result in an answer"],
          ["Improve a Workplace Message", "edit a vague message into a concise actionable update"],
          ["Prepare an Interview Evidence Bank", "prepare reusable examples without memorizing scripts"],
          ["Create a Communication Improvement Plan", "select a specific communication habit and measure improvement"],
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
          ["Identify the Action in an Instruction", "identify the required action, object and deadline in an English instruction"],
          ["Ask a Focused Clarifying Question", "ask for missing information in clear simple English"],
          ["Confirm Understanding", "confirm a task in your own words"],
          ["Follow Multi Step Instructions", "sequence and complete multi-step instructions"],
        ],
      },
      {
        title: "Professional Messages",
        levels: [
          ["Write a Useful Subject Line", "write a concise subject line that states topic and action"],
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
          ["Provide Relevant Context", "supply enough context without exposing sensitive information"],
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
          ["Protect Private Information", "identify information that should not be sent to an AI provider"],
          ["Keep Humans in Important Decisions", "place human approval at high-impact decision points"],
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
          ["Define a Specific Service", "describe a service by client problem, deliverable and boundary"],
          ["Read a Client Brief", "extract goals, deliverables, constraints and unanswered questions"],
          ["Ask High Value Discovery Questions", "ask questions that reduce delivery and commercial risk"],
          ["Decide Whether the Project Fits", "evaluate capability, capacity, risk and client fit"],
        ],
      },
      {
        title: "Scope and Commercials",
        levels: [
          ["Write a Clear Scope", "write deliverables, acceptance criteria and boundaries"],
          ["Estimate with Assumptions", "estimate effort while making dependencies visible"],
          ["Define Revisions and Change Control", "separate included revisions from new scope"],
          ["Use Milestones and Payment Protection", "structure payment around verified delivery stages"],
        ],
      },
      {
        title: "Delivery and Client Safety",
        levels: [
          ["Send Useful Progress Updates", "communicate progress, decisions, risks and next steps"],
          ["Handle Feedback and Disagreement", "turn feedback into an agreed actionable change"],
          ["Deliver a Professional Handover", "provide verified files, instructions and ownership records"],
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
          ["Define a Useful Audience Segment", "describe an audience by situation, need and behavior"],
          ["Identify the Real Customer Problem", "distinguish a customer problem from a product feature"],
          ["Write a Clear Value Proposition", "connect audience, outcome and differentiator"],
          ["Choose a Specific Call to Action", "match one call to action to the audience stage"],
        ],
      },
      {
        title: "Funnel and Content",
        levels: [
          ["Map the Customer Journey", "map awareness, consideration, conversion and retention needs"],
          ["Set a Content Objective", "give each content item one measurable purpose"],
          ["Match Channel to Behavior", "select a channel based on audience behavior and content format"],
          ["Build a Testable Content Plan", "plan themes, formats, cadence and hypotheses"],
        ],
      },
      {
        title: "Measurement and Improvement",
        levels: [
          ["Choose a Decision Useful KPI", "select a metric connected to a business decision"],
          ["Use Clean Campaign Attribution", "use consistent campaign parameters and source records"],
          ["Run a Controlled Experiment", "test one meaningful change with a clear success measure"],
          ["Report Insight and Next Action", "turn results into evidence, interpretation and action"],
        ],
      },
    ],
  },
] as const;

const categories = {
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

function objectiveCode(skillSlug: string, moduleIndex: number, levelIndex: number): string {
  const prefix = skillSlug
    .split("-")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 12);
  return `${prefix}_M${String(moduleIndex + 1).padStart(2, "0")}_L${String(levelIndex + 1).padStart(2, "0")}`;
}

function strongApproach(objective: string): string {
  return `Confirm the requirement, use specific evidence and take a clear, proportionate action to ${objective}.`;
}

function weakApproach(objective: string): string {
  return `Rely on a vague assumption and act without checking evidence while trying to ${objective}.`;
}

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-complete-launch-seed",
  maxConnections: 2,
});

const database = await client.pool.connect();
try {
  await database.query("begin");

  const categoryIds = new Map<string, string>();
  for (const [index, [categorySlug, category]] of Object.entries(categories).entries()) {
    const categoryIdCandidate = uuid(`category:${categorySlug}`);
    const upserted = await database.query<{ id: string }>(
      `insert into skill_categories (id, slug, default_locale, sort_order)
       values ($1, $2, 'en', $3)
       on conflict (slug) do update set sort_order = excluded.sort_order
       returning id`,
      [categoryIdCandidate, categorySlug, index + 1],
    );
    const categoryId = upserted.rows[0]?.id;
    if (!categoryId) throw new Error(`Category ${categorySlug} could not be resolved.`);
    categoryIds.set(categorySlug, categoryId);

    await database.query(
      `insert into skill_category_versions
        (id, category_id, version, locale, title, summary, state, index_policy, reviewed_at, published_at)
       values ($1, $2, 1, 'en', $3, $4, 'published', 'index', $5, $5)
       on conflict (category_id, version, locale) do update
         set title = excluded.title,
             summary = excluded.summary,
             state = 'published',
             index_policy = 'index',
             reviewed_at = excluded.reviewed_at,
             published_at = excluded.published_at`,
      [uuid(`category:${categorySlug}:v1`), categoryId, category[0], category[1], reviewedAt],
    );
  }

  for (const definition of skillDefinitions) {
    const catalog = launchCatalogSeed.find((item) => item.skill.slug === definition.skillSlug);
    if (!catalog) throw new Error(`Missing launch catalog entry for ${definition.skillSlug}.`);
    const categoryId = categoryIds.get(definition.category);
    if (!categoryId) throw new Error(`Missing resolved category ${definition.category}.`);

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

    for (const [moduleIndex, module] of definition.modules.entries()) {
      const moduleSlug = slug(module.title);
      const moduleId = uuid(`${definition.skillSlug}:module:${moduleSlug}`);
      const moduleVersionId = uuid(`${definition.skillSlug}:module:${moduleSlug}:v1`);
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
           set title = excluded.title,
               summary = excluded.summary,
               state = 'published',
               reviewed_at = excluded.reviewed_at,
               published_at = excluded.published_at`,
        [
          moduleVersionId,
          moduleId,
          catalog.path.versionId,
          module.title,
          `Practice the essential decisions in ${module.title.toLocaleLowerCase("en-US")} through concise, realistic study and work situations.`,
          reviewedAt,
        ],
      );

      for (const [levelIndex, level] of module.levels.entries()) {
        const [title, objective] = level;
        const levelSlug = slug(title);
        const lessonSlug = `${levelSlug}-lesson`;
        const lessonId = uuid(`${definition.skillSlug}:lesson:${lessonSlug}`);
        const lessonVersionId = uuid(`${definition.skillSlug}:lesson:${lessonSlug}:v1`);
        const levelId = uuid(`${definition.skillSlug}:level:${levelSlug}`);
        const levelVersionId = uuid(`${definition.skillSlug}:level:${levelSlug}:v1`);

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
             set title = excluded.title,
                 summary = excluded.summary,
                 state = 'published',
                 reviewed_at = excluded.reviewed_at,
                 published_at = excluded.published_at`,
          [
            lessonVersionId,
            lessonId,
            moduleVersionId,
            title,
            `Learn how to ${objective} with a specific, evidence-based action and a clear boundary for common mistakes.`,
            reviewedAt,
          ],
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
             set title = excluded.title,
                 public_summary = excluded.public_summary,
                 instructions = excluded.instructions,
                 state = 'published',
                 reviewed_at = excluded.reviewed_at,
                 published_at = excluded.published_at`,
          [
            levelVersionId,
            levelId,
            lessonVersionId,
            title,
            `Practice how to ${objective} and distinguish a reliable action from a vague or unsafe alternative.`,
            "Complete three short challenges. Review each explanation and identify the evidence, action and boundary that make the stronger response reliable.",
            reviewedAt,
          ],
        );
        await database.query(
          `insert into learning_objectives
            (id, level_version_id, code, statement, assessable, sort_order)
           values ($1, $2, $3, $4, true, 1)
           on conflict (level_version_id, code) do update set statement = excluded.statement`,
          [
            uuid(`${definition.skillSlug}:objective:${levelSlug}`),
            levelVersionId,
            objectiveCode(definition.skillSlug, moduleIndex, levelIndex),
            `The learner can ${objective}.`,
          ],
        );
        await database.query(
          `insert into content_source_references
            (id, level_version_id, kind, title, locator, sort_order)
           values ($1, $2, 'internal_editorial', $3, $4, 1)
           on conflict (id) do nothing`,
          [
            uuid(`${definition.skillSlug}:source:${levelSlug}`),
            levelVersionId,
            `SkillUp reviewed ${catalog.skill.title} launch curriculum`,
            `${module.title} / ${title}`,
          ],
        );

        const strong = strongApproach(objective);
        const weak = weakApproach(objective);
        const challenges = [
          {
            key: "best-practice",
            type: "multiple_choice",
            prompt: `Which response best demonstrates how to ${objective}?`,
            instruction: "Choose the strongest answer.",
            explanation: `The stronger response confirms the requirement and uses evidence before acting. ${strong}`,
            publicPayload: { selectionLimit: 1 },
            privateEvaluation: { correctOptionKeys: ["best"] },
            options: [
              ["best", strong],
              ["mistake", weak],
              ["vague", "Use a confident general statement without checking the requirement, evidence or next action."],
            ],
          },
          {
            key: "check-misconception",
            type: "true_false",
            prompt: `True or false: ${weak}`,
            instruction: "Choose true or false.",
            explanation: `This is false. A reliable approach confirms the requirement, checks evidence and takes a proportionate action.`,
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
            prompt: `A learner needs to ${objective}. Which action should they choose first?`,
            instruction: "Choose the safest and most useful action.",
            explanation: `Choose the action that is specific, evidence-based and proportionate. ${strong}`,
            publicPayload: {},
            privateEvaluation: { correctOptionKeys: ["best"] },
            options: [
              ["best", strong],
              ["partial", "Act immediately with incomplete context and plan to correct the work later."],
              ["risky", weak],
            ],
          },
        ] as const;

        for (const [challengeIndex, challenge] of challenges.entries()) {
          const challengeSlug = `${levelSlug}-${challenge.key}`;
          const challengeId = uuid(`${definition.skillSlug}:challenge:${challengeSlug}`);
          const challengeVersionId = uuid(`${definition.skillSlug}:challenge:${challengeSlug}:v1`);
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
               set prompt = excluded.prompt,
                   instruction = excluded.instruction,
                   explanation = excluded.explanation,
                   public_payload = excluded.public_payload,
                   state = 'published',
                   reviewed_at = excluded.reviewed_at,
                   published_at = excluded.published_at`,
            [
              challengeVersionId,
              challengeId,
              levelVersionId,
              challenge.type,
              challenge.prompt,
              challenge.instruction,
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
                 set label = excluded.label,
                     sort_order = excluded.sort_order`,
              [
                uuid(`${definition.skillSlug}:option:${challengeSlug}:${option[0]}`),
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
               set private_evaluation = excluded.private_evaluation,
                   updated_at = excluded.updated_at`,
            [challengeVersionId, JSON.stringify(challenge.privateEvaluation), reviewedAt],
          );
          await database.query(
            `insert into content_publication_records
              (entity_type, entity_version_id, state, index_policy, canonical_path,
               reviewed_at, published_at, updated_at)
             select 'challenge_version', $1, 'published', 'noindex', $2, $3, $3, $3
             where not exists (
               select 1
                 from content_publication_records
                where entity_type = 'challenge_version' and entity_version_id = $1
             )`,
            [
              challengeVersionId,
              `/en/learn/${catalog.path.slug}/${moduleSlug}/${lessonSlug}/${levelSlug}`,
              reviewedAt,
            ],
          );
        }

        await database.query(
          `insert into content_publication_records
            (entity_type, entity_version_id, state, index_policy, canonical_path,
             reviewed_at, published_at, updated_at)
           select 'level_version', $1, 'published', 'noindex', $2, $3, $3, $3
           where not exists (
             select 1
               from content_publication_records
              where entity_type = 'level_version' and entity_version_id = $1
           )`,
          [
            levelVersionId,
            `/en/learn/${catalog.path.slug}/${moduleSlug}/${lessonSlug}/${levelSlug}`,
            reviewedAt,
          ],
        );
      }
    }
  }

  await database.query("commit");
  const totalLevels = skillDefinitions.reduce(
    (total, skill) =>
      total + skill.modules.reduce((moduleTotal, module) => moduleTotal + module.levels.length, 0),
    0,
  );
  console.log(
    `Complete SkillUp launch curriculum is present (${skillDefinitions.length} skills, ${totalLevels} generated levels, ${totalLevels * 3} generated challenges).`,
  );
} catch (error) {
  await database.query("rollback").catch(() => undefined);
  throw error;
} finally {
  database.release();
  await client.close();
}
