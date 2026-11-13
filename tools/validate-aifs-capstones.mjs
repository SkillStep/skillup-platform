import { readFileSync } from "node:fs";

const manifest = new URL("../docs/product/course-expansion/catalog-plan-v1.json", import.meta.url);
const folder = new URL("../docs/product/course-expansion/capstones/", import.meta.url);

export function readCapstonePack() {
  const plan = JSON.parse(readFileSync(manifest, "utf8"));
  const files = plan.courses
    .filter((course) => course.slug !== "excel-google-sheets-work")
    .map((course) => ({
      slug: course.slug,
      title: course.title,
      text: readFileSync(new URL(`${course.slug}.md`, folder), "utf8"),
    }));
  const excel = readFileSync(
    new URL("../docs/product/course-expansion/drafts/excel/CAPSTONE.md", import.meta.url),
    "utf8",
  );
  return { files, excel };
}

const numberedHeaders = [
  "## Fictional scenario",
  "## Starting materials and constraints",
  "## Student deliverables",
  "## Self-check rubric",
  "## Ethical and technical boundaries",
];

function sectionText(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const after = text.slice(start + heading.length);
  const nextHeading = after.indexOf("\n## ");
  return nextHeading < 0 ? after : after.slice(0, nextHeading);
}

export function validateCapstonePack(files, excel) {
  const errors = [];
  if (!Array.isArray(files) || files.length !== 14) {
    return ["The capstone pack must contain exactly fourteen additional courses."];
  }
  const titles = new Set();
  const slugs = new Set();
  for (const { slug, title, text } of files) {
    if (slugs.has(slug)) errors.push(`Repeated capstone course slug: ${slug}.`);
    slugs.add(slug);
    if (!text.startsWith(`# ${title} — practical capstone project\n`)) {
      errors.push(`Capstone ${slug} has no correctly titled project brief.`);
    }
    if (!text.includes("**Draft educational asset. Status: NOT REVIEWED / NOT PUBLISHED.**")) {
      errors.push(`Capstone ${slug} must explicitly remain unpublished.`);
    }
    if (!text.includes(`**Course:** \`${slug}\``)) {
      errors.push(`Capstone ${slug} is not mapped to its declared course.`);
    }
    if (!text.includes("Actual subject reviewer") || !text.includes("authorized publisher")) {
      errors.push(`Capstone ${slug} lacks a real human editorial gate.`);
    }
    for (const heading of numberedHeaders) {
      if (!text.includes(heading)) errors.push(`Capstone ${slug} missing: ${heading}.`);
    }
    if (sectionText(text, "## Fictional scenario").trim().length < 135) {
      errors.push(`Capstone ${slug} needs a meaningful original scenario.`);
    }
    for (const heading of [
      "## Starting materials and constraints",
      "## Student deliverables",
      "## Self-check rubric",
    ]) {
      const bullets = sectionText(text, heading)
        .split("\n")
        .filter((line) => line.startsWith("- "));
      if (bullets.length < (heading.includes("materials") ? 3 : 4)) {
        errors.push(`Capstone ${slug}: insufficient useful steps in ${heading}.`);
      }
    }
    if (text.length < 1_300) errors.push(`Capstone ${slug} is too thin.`);
    if (titles.has(title)) errors.push(`Duplicate capstone title: ${title}.`);
    titles.add(title);
  }
  if (
    typeof excel !== "string" ||
    !excel.includes("Excel for Work") ||
    !excel.includes("## Learner capstone instructions") ||
    !excel.includes("## Self-check rubric")
  ) {
    errors.push("The first Excel capstone must remain available with its rubric.");
  }
  return errors;
}

if (process.argv[1]?.endsWith("validate-aifs-capstones.mjs")) {
  const { files, excel } = readCapstonePack();
  const errors = validateCapstonePack(files, excel);
  if (errors.length) {
    for (const error of errors) console.error(`CAPSTONE QUALITY ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.info(
      "Practical capstones checked: 14 distinct new kits + original Excel tracker. Publication not authorized.",
    );
  }
}
