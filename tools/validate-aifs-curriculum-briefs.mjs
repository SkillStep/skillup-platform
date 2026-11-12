import { readFileSync } from "node:fs";

const catalogUrl = new URL(
  "../docs/product/course-expansion/catalog-plan-v1.json",
  import.meta.url,
);
const outlineRoot = new URL("../docs/product/course-expansion/outlines/", import.meta.url);

export function readCurriculumPlan() {
  const manifest = JSON.parse(readFileSync(catalogUrl, "utf8"));
  const outlines = manifest.courses.map((course) =>
    JSON.parse(readFileSync(new URL(`${course.slug}.json`, outlineRoot), "utf8")),
  );
  return { manifest, outlines };
}

export function validateCurriculumBriefs(manifest, outlines) {
  const errors = [];
  if (!Array.isArray(manifest?.courses) || manifest.courses.length !== 15) {
    return ["Exactly 15 approved planning scopes are required."];
  }
  if (!Array.isArray(outlines) || outlines.length !== 15) {
    return ["Exactly 15 draft level outlines are required."];
  }
  const seenCourses = new Set();
  let levelCount = 0;
  for (const [courseIndex, scope] of manifest.courses.entries()) {
    const outline = outlines[courseIndex];
    const name = scope.slug;
    if (
      outline?.schemaVersion !== 1 ||
      outline?.courseSlug !== name ||
      outline?.courseTitle !== scope.title ||
      outline?.wave !== scope.wave ||
      outline?.locale !== "en" ||
      outline?.state !== "outline_draft" ||
      outline?.publicationAllowed !== false ||
      outline?.reviewedBy !== null ||
      outline?.publishedAt !== null ||
      outline?.capstone !== scope.capstoneDeliverable ||
      outline?.learningOutcome !== scope.learningOutcome
    ) {
      errors.push(`Course ${name}: invalid identity, human-review boundary or capstone.`);
    }
    if (seenCourses.has(outline?.courseSlug)) errors.push(`Duplicate course: ${name}.`);
    seenCourses.add(outline?.courseSlug);

    if (!Array.isArray(outline?.modules) || outline.modules.length !== 4) {
      errors.push(`Course ${name}: expected exactly four modules.`);
      continue;
    }
    const levelTitles = new Set();
    for (const [moduleIndex, module] of outline.modules.entries()) {
      const scopedModule = scope.modules[moduleIndex];
      if (
        module?.moduleNumber !== moduleIndex + 1 ||
        module.moduleTitle !== scopedModule?.title ||
        module.objective !== scopedModule?.learningObjective ||
        module.exampleScenario !== scopedModule?.exampleLevel ||
        module.reviewStatus !== "subject_review_pending"
      ) {
        errors.push(`Course ${name}, module ${moduleIndex + 1}: not aligned to product scope.`);
      }
      if (!Array.isArray(module?.levelTitles) || module.levelTitles.length !== 6) {
        errors.push(`Course ${name}, module ${moduleIndex + 1}: expected six levels.`);
        continue;
      }
      for (const title of module.levelTitles) {
        levelCount += 1;
        if (
          typeof title !== "string" ||
          title.length < 16 ||
          title.length > 110 ||
          title.trim() !== title ||
          /^(step|level|module|lesson) [0-9]/i.test(title)
        ) {
          errors.push(`Course ${name}: an unhelpful or generic level title was found.`);
        }
        const normalized = typeof title === "string" ? title.toLocaleLowerCase("en-US") : "";
        if (levelTitles.has(normalized)) errors.push(`Course ${name}: duplicate title ${title}.`);
        levelTitles.add(normalized);
      }
    }
    if (levelTitles.size !== 24) errors.push(`Course ${name}: expected 24 distinct levels.`);
  }
  if (levelCount !== 360)
    errors.push(`Expected 360 distinct proposed level positions; found ${levelCount}.`);
  return errors;
}

export function buildAiDraftRequestBriefs(manifest, outlines) {
  const errors = validateCurriculumBriefs(manifest, outlines);
  if (errors.length) throw new Error(`Invalid AI-first course briefs: ${errors.join("; ")}`);
  const requests = [];
  for (const [courseIndex, course] of manifest.courses.entries()) {
    const outline = outlines[courseIndex];
    for (const module of outline.modules) {
      for (const [index, title] of module.levelTitles.entries()) {
        const levelNumber = (module.moduleNumber - 1) * 6 + index + 1;
        requests.push({
          jobType: "draft_only_generate_level",
          task: "generate_level",
          promptVersion: "aifs-curriculum-level-v1",
          requestedItems: 1,
          courseSlug: course.slug,
          moduleNumber: module.moduleNumber,
          levelNumber,
          locale: "en",
          publicationStatus: "draft",
          reviewedBy: null,
          publishedAt: null,
          inputPayload: {
            title,
            learnerAudience: course.audience,
            courseLearningOutcome: course.learningOutcome,
            moduleTitle: module.moduleTitle,
            moduleObjective: module.objective,
            levelNumber,
            levelCount: 24,
            scenarioSeed: module.exampleScenario,
            capstoneOutcome: course.capstoneDeliverable,
            contextCountry: "Pakistan",
            permittedData: "fictional examples only",
            originality: "distinct scenarios, non-recycled subject-specific questions",
            practiceRequirement: "three different supported exercise types; correct private keys",
            teachingRequirement:
              "clear explanation, worked example, hint and misconception remediation",
            sourcePolicy: "no unverified citations or copyrighted third-party course copies",
            editorialState:
              "unreviewed draft; human subject, language and publisher approval required",
          },
        });
      }
    }
  }
  return requests;
}

if (process.argv[1]?.endsWith("validate-aifs-curriculum-briefs.mjs")) {
  const { manifest, outlines } = readCurriculumPlan();
  const errors = validateCurriculumBriefs(manifest, outlines);
  if (errors.length) {
    for (const error of errors) console.error(`AI CURRICULUM BRIEF ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    const jobs = buildAiDraftRequestBriefs(manifest, outlines);
    if (process.argv[2] === "--jsonl") {
      for (const job of jobs) console.info(JSON.stringify(job));
    } else if (process.argv.length === 2) {
      console.info(
        "AI-first level outlines validated: 15 courses, 60 modules, 360 unique level briefs. Publication not authorized.",
      );
    } else {
      console.error("Only --jsonl is allowed; the tool never executes queued AI jobs.");
      process.exitCode = 1;
    }
  }
}
