import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Fail closed when team-five release assessment answer keys appear in the public tree.
 * Related: docs/product/course-expansion/PRIVATE_ASSESSMENT_BANK_OPERATIONS.md (#281).
 */

const root = resolve(import.meta.dirname, "..");

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  ".tmp-cert",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
  "private-editorial",
]);

const scannedExtensions = new Set([".json"]);

const syntheticAllowlist = [
  /(^|[/\\])tools[/\\].*\.test\.mjs$/i,
  /(^|[/\\]).*\.test\.(ts|tsx|js|mjs)$/i,
];

/** Active launch blocker: five-course banks from PR #280 must not land in public git. */
const teamFiveReleaseBank =
  /(^|[/\\])docs[/\\]product[/\\]course-expansion[/\\]drafts[/\\]team-five[/\\].+\.json$/i;

/**
 * Already-on-main Excel pilot drafts also embed answers (#281). Tracked as known debt
 * until content re-keys them into private-editorial/; they do not fail this gate yet
 * so the team-five launch scan can land without breaking current main CI.
 */
const knownPublicPilotDebt =
  /(^|[/\\])docs[/\\]product[/\\]course-expansion[/\\]drafts[/\\]excel[/\\].+\.json$/i;

const answerFieldPatterns = [
  /"answer"\s*:/,
  /"privateEvaluation"\s*:/,
  /"correctOptionKeys"\s*:/,
  /"correctAnswer"\s*:/,
  /"evaluatorKey"\s*:/,
];

function files(directory) {
  const discovered = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) discovered.push(...files(path));
    else if (entry.isFile()) discovered.push(path);
  }
  return discovered;
}

function isSyntheticAllowlisted(relativePath) {
  return syntheticAllowlist.some((pattern) => pattern.test(relativePath));
}

export function findPublicAssessmentKeyLeaks(repositoryRoot = root) {
  const blockers = [];
  const knownDebts = [];

  for (const path of files(repositoryRoot)) {
    const rel = relative(repositoryRoot, path).replaceAll("\\", "/");
    if (!scannedExtensions.has(extname(path).toLowerCase())) continue;
    if (isSyntheticAllowlisted(rel)) continue;

    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > 4 * 1_024 * 1_024) continue;

    const content = readFileSync(path, "utf8");
    if (content.includes("\u0000")) continue;

    const hit = answerFieldPatterns.find((pattern) => pattern.test(content));
    if (!hit) continue;

    if (teamFiveReleaseBank.test(rel)) {
      blockers.push(`${rel}: team-five release draft embeds evaluator answer fields`);
      continue;
    }

    if (knownPublicPilotDebt.test(rel)) {
      knownDebts.push(`${rel}: Excel pilot draft still embeds public answer fields`);
    }
  }

  return { blockers, knownDebts };
}

export function assertNoPublicTeamFiveAssessmentKeyLeaks(repositoryRoot = root) {
  const { blockers, knownDebts } = findPublicAssessmentKeyLeaks(repositoryRoot);
  if (knownDebts.length > 0) {
    console.warn(
      `Known public pilot assessment-key debt (#281), ${knownDebts.length} file(s):\n` +
        `${knownDebts.slice(0, 8).join("\n")}` +
        (knownDebts.length > 8 ? `\n… +${knownDebts.length - 8} more` : ""),
    );
  }
  if (blockers.length > 0) {
    throw new Error(
      `Public team-five assessment key leak scan failed (#281):\n${blockers.join("\n")}\n` +
        "Independently re-key into private-editorial/assessment-banks/ before merge/publish.",
    );
  }
  return { blockers, knownDebts };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertNoPublicTeamFiveAssessmentKeyLeaks();
  console.log("SkillUp public team-five assessment key leak scan passed.");
}
