import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Read-only preflight for future human-reviewed, privately stored assessment banks.
 * Requires an EXTERNAL secure directory; no source is printed, imported or published.
 * This cannot authenticate SME review, secure a repo, or validate subject accuracy.
 */
const publicRepository = resolve(import.meta.dirname, "..");
export const COURSES = Object.freeze([
  "prompt-engineering-generative-ai",
  "cybersecurity-digital-safety",
  "data-analytics-dashboards",
  "applied-ai-workflows",
  "sales-client-negotiation",
]);

function fail(message) {
  throw new Error(`Assessment bank preflight: ${message}`);
}
function restricted(path, kind) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    fail(`${kind} missing`);
  }
  if (stat.isSymbolicLink()) fail(`${kind} must not be a symbolic link`);
  if (kind === "directory" && !stat.isDirectory()) fail("bank root is not a directory");
  if (kind !== "directory" && !stat.isFile()) fail(`${kind} is not a regular file`);
  if (process.platform !== "win32" && stat.mode & 0o077) {
    fail(`${kind} must have owner-only permissions (directory 0700, file 0600)`);
  }
  if (stat.size > 4 * 1024 * 1024) fail(`${kind} exceeds 4 MiB maximum`);
  return stat;
}
function readPrivateJson(path) {
  restricted(path, "private assessment file");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("invalid private assessment JSON");
  }
}
function text(value, label, min = 8) {
  if (typeof value !== "string" || value.trim().length < min) fail(`${label} missing or too short`);
}
function assertItems(data, course, type, allIds, allPrompts) {
  if (!data || typeof data !== "object" || Array.isArray(data)) fail(`invalid ${type} structure`);
  if (data.courseSlug !== course) fail("bank course slug mismatch");
  text(data.version, "immutable bank version", 6);
  if (!Array.isArray(data.items) || data.items.length !== (type === "practice" ? 72 : 8)) {
    fail(`${type} count mismatch for ${course}`);
  }
  const eachLevel = Array.from({ length: 24 }, () => 0);
  const eachPhase = { baseline: 0, endline: 0 };
  for (const item of data.items) {
    if (!item || typeof item !== "object") fail("invalid assessment item");
    text(item.id, "item ID");
    text(item.prompt, "original prompt", 30);
    text(item.explanation, "learner feedback/explanation", 20);
    text(item.sourceReference, "source/rights reference", 5);
    if (!Array.isArray(item.choices) || item.choices.length < 2 || item.choices.length > 6) {
      fail("each item requires 2-6 answer choices");
    }
    const answerOptions = new Set();
    for (const choice of item.choices) {
      if (!choice || typeof choice !== "object") fail("invalid choice");
      text(choice.id, "choice ID", 1);
      text(choice.label, "choice label", 1);
      if (answerOptions.has(choice.id)) fail("duplicate choice ID");
      answerOptions.add(choice.id);
    }
    if (!answerOptions.has(item.correctChoiceId)) fail("answer key does not match choices");
    if (allIds.has(item.id)) fail("duplicate question ID across banks");
    allIds.add(item.id);
    const normalizedPrompt = item.prompt.trim().toLowerCase().replace(/\s+/g, " ");
    const digest = createHash("sha256").update(normalizedPrompt).digest("hex");
    if (allPrompts.has(digest)) fail("duplicate question prompt across banks");
    allPrompts.add(digest);
    if (type === "practice") {
      if (!Number.isInteger(item.levelNumber) || item.levelNumber < 1 || item.levelNumber > 24) {
        fail("practice item has invalid levelNumber");
      }
      eachLevel[item.levelNumber - 1]++;
    } else {
      if (!(item.phase in eachPhase)) fail("assessment requires baseline or endline phase");
      eachPhase[item.phase]++;
    }
  }
  if (type === "practice" && eachLevel.some((x) => x !== 3)) {
    fail("each of the 24 levels must have exactly three distinct practice questions");
  }
  if (type === "assessments" && (eachPhase.baseline !== 4 || eachPhase.endline !== 4)) {
    fail("each course requires four baseline and four endline questions");
  }
}
export function validatePrivateBankRoot(directory) {
  if (!directory || !isAbsolute(directory))
    fail("AIFS_PRIVATE_BANK_ROOT must be an absolute external path");
  restricted(directory, "directory");
  const realRoot = realpathSync(directory);
  const repository = realpathSync(publicRepository);
  const diff = relative(repository, realRoot);
  if (!diff || (!diff.startsWith("..") && !isAbsolute(diff))) {
    fail("private bank must be OUTSIDE the public Git checkout; .gitignore is not protection");
  }
  return realRoot;
}
export function validatePrivateAssessmentBanks(directory) {
  const realRoot = validatePrivateBankRoot(directory);
  const allIds = new Set();
  const allPrompts = new Set();
  for (const course of COURSES) {
    for (const type of ["practice", "assessments"]) {
      const path = join(realRoot, `${course}.${type}.json`);
      const bank = readPrivateJson(path);
      assertItems(bank, course, type, allIds, allPrompts);
    }
  }
  return {
    courseCount: 5,
    practiceItems: 360,
    assessmentItems: 40,
    totalItems: 400,
    result: "structural checks passed; HUMAN sign-off still required",
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = validatePrivateAssessmentBanks(process.env.AIFS_PRIVATE_BANK_ROOT);
  console.log(JSON.stringify(result));
}
