import { readFileSync } from "node:fs";

const root = new URL("../docs/product/course-expansion/", import.meta.url);
const planPath = new URL("team-five-skills-certificate-plan-v1.json", root);
const previousPath = new URL("catalog-plan-v1.json", root);
const outlinesPath = new URL("team-five-outlines/", root);

export function loadTeamFiveDrafts() {
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const legacy = JSON.parse(readFileSync(previousPath, "utf8"));
  const outlines = plan.teamAdditions.map((item) =>
    JSON.parse(readFileSync(new URL(`${item.canonicalDraftSlug}.json`, outlinesPath), "utf8")),
  );
  return { plan, legacy, outlines };
}

export function validateTeamFiveDrafts(plan, legacy, outlines) {
  const errors = [];
  if (!Array.isArray(plan?.teamAdditions) || plan.teamAdditions.length !== 5) {
    return ["Exactly five proposed course outlines must be defined in the team addendum."];
  }
  if (!Array.isArray(legacy?.courses) || legacy.courses.length !== 15) {
    return ["The original fifteen planned courses must remain unchanged."];
  }
  if (!Array.isArray(outlines) || outlines.length !== 5) {
    return ["Five and only five revised/new outline files must exist."];
  }
  const existingSlugs = new Set(legacy.courses.map((c) => c.slug));
  const all = new Set();
  const allLevelTitles = new Set();
  let levelCount = 0;
  let reuseCount = 0;
  for (const [i, addition] of plan.teamAdditions.entries()) {
    const outline = outlines[i];
    const slug = addition.canonicalDraftSlug;
    if (all.has(slug)) errors.push(`Duplicate team draft slug: ${slug}`);
    all.add(slug);
    if (addition.reuseExistingDraft !== existingSlugs.has(slug)) {
      errors.push(`Incorrect new/reused classification: ${slug}`);
    }
    if (addition.reuseExistingDraft) reuseCount++;
    if (
      outline?.schemaVersion !== 1 ||
      outline.courseSlug !== slug ||
      outline.courseTitle !== addition.title ||
      outline.publicPreviewSummary !== addition.description ||
      outline.existingDraftIdentityReused !== addition.reuseExistingDraft ||
      outline.issueNumber !== addition.issueNumber ||
      outline.locale !== "en" ||
      outline.state !== "outline_draft" ||
      outline.publicationAllowed !== false ||
      outline.reviewedBy !== null ||
      outline.publishedAt !== null ||
      outline.humanSubjectReviewPending !== true
    ) {
      errors.push(`Course ${slug} contradicts the approved preview plan or claims human approval.`);
    }
    if (!Array.isArray(outline?.modules) || outline.modules.length !== 4) {
      errors.push(`Course ${slug} must contain four distinct modules.`);
      continue;
    }
    if (typeof outline?.capstone !== "string" || outline.capstone.length < 40) {
      errors.push(`Course ${slug} needs a concrete proposed capstone.`);
    }
    const courseTitles = new Set();
    for (const [index, m] of outline.modules.entries()) {
      const plannedTitle = addition.modules[index];
      if (m?.moduleTitle !== plannedTitle || m.moduleNumber !== index + 1 ||
          typeof m.learningObjective !== "string" || m.learningObjective.length < 45 ||
          m.reviewStatus !== "subject_review_pending") {
        errors.push(`Course ${slug}: module ${index + 1} does not match its unreviewed scope.`);
      }
      if (!Array.isArray(m.levelTitles) || m.levelTitles.length !== 6) {
        errors.push(`Course ${slug}: module ${index + 1} needs six level titles.`);
        continue;
      }
      for (const raw of m.levelTitles) {
        if (typeof raw !== "string" || raw.length < 20 || raw.length > 110 ||
            /^(step|lesson|level|module)\s+[0-9]/i.test(raw)) {
          errors.push(`Course ${slug} has a generic or invalid level title.`);
          continue;
        }
        const title = raw.toLowerCase();
        if (courseTitles.has(title)) errors.push(`Course ${slug} repeats a level title: ${raw}`);
        courseTitles.add(title);
        if (allLevelTitles.has(title)) errors.push(`Cross-course duplicate learning level: ${raw}`);
        allLevelTitles.add(title);
        levelCount++;
      }
    }
    if (courseTitles.size !== 24) errors.push(`Course ${slug} needs 24 distinct titles.`);
  }
  if (reuseCount !== 3 || all.size !== 5) {
    errors.push("Two net-new courses and three reused drafts are required.");
  }
  if (levelCount !== 120) errors.push(`Expected 120 draft level titles, found ${levelCount}.`);
  if (plan.certificateScope?.initialEligibleSkills?.length !== 10) {
    errors.push("The 10 certificate titles must remain represented in the scope map.");
  }
  return errors;
}

if (process.argv[1] && new URL(process.argv[1], "file:").href === import.meta.url) {
  const { plan, legacy, outlines } = loadTeamFiveDrafts();
  const errors = validateTeamFiveDrafts(plan, legacy, outlines);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.info(
      "Verified five distinct unreviewed draft outlines, 120 specific level titles, two new courses, three reused IDs, and ten certificate titles. No import or publication.",
    );
  }
}
