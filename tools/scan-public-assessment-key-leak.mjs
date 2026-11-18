import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Public-tree guard, not a substitute for private storage, Git-history review,
 * built-artifact inspection, authorized human sign-off or subject accuracy.
 * Runs in CI before a release candidate can add final assessment keys.
 */
const root = resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([
  ".git", ".next", ".pnpm-store", ".tmp-cert", "artifacts", "coverage",
  "dist", "node_modules", "private-editorial",
]);
const scanExtensions = new Set([".json", ".jsonl", ".yaml", ".yml", ".md", ".txt", ".csv", ".js", ".mjs", ".ts", ".tsx"]);
const activeSlugs = [
  "prompt-engineering-generative-ai",
  "cybersecurity-digital-safety",
  "data-analytics-dashboards",
  "applied-ai-workflows",
  "sales-client-negotiation",
];
const teamFiveDirectory = /^docs\/product\/course-expansion\/drafts\/team-five\//i;
const oldExcelDirectory = /^docs\/product\/course-expansion\/drafts\/excel\//i;
const locallyPrivateDirectory = /^private-editorial\/assessment-banks\//i;
const keyField = /["']?(?:answer|answers|correctAnswer|correctOptionKeys|correctOption|correctIndex|expectedAnswer|evaluatorKey|privateEvaluation|gradingKey|scoringKey)["']?\s*[:=]/i;
const pathOutsideDrafts = /(?:assessment|challenge|answer|evaluation|question|bank)/i;

function walk(directory, base = directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, base));
    else if (entry.isFile() || entry.isSymbolicLink()) found.push(relative(base, full).replaceAll("\\", "/"));
  }
  return found;
}

function trackedFiles(directory) {
  try {
    // Only Git-tracked files can be shipped with this public repository. This
    // includes forcibly tracked files hidden behind a .gitignore rule.
    const output = execFileSync("git", ["-C", directory, "ls-files", "--cached", "-z"], {
      encoding: "utf8", timeout: 15000, maxBuffer: 16 * 1024 * 1024,
    });
    return output.split("\0").filter(Boolean);
  } catch {
    // Enables isolated fixtures in non-git test directories.
    return walk(directory);
  }
}

export function findPublicAssessmentKeyLeaks(repositoryRoot = root, options = {}) {
  const blockers = [];
  const knownDebts = [];
  const paths = options.trackedPaths ?? trackedFiles(repositoryRoot);
  for (const raw of paths) {
    const rel = raw.replaceAll("\\", "/");
    if (!scanExtensions.has(extname(rel).toLowerCase())) continue;
    if (rel.endsWith(".test.mjs") || rel.endsWith(".test.ts") || rel.endsWith(".spec.ts")) continue;
    if (rel === "tools/scan-public-assessment-key-leak.mjs") continue;
    const isTeamFive = teamFiveDirectory.test(rel);
    const isOldExcel = oldExcelDirectory.test(rel);
    const isPrivatePathTracked = locallyPrivateDirectory.test(rel);
    const full = resolve(repositoryRoot, rel);
    if (!full.startsWith(resolve(repositoryRoot) + "/")) continue;
    let stat;
    try { stat = lstatSync(full); } catch { continue; }
    if (stat.isSymbolicLink()) {
      if (isTeamFive || isPrivatePathTracked) blockers.push(rel + ": tracked assessment source may not be a symlink");
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > 4 * 1024 * 1024) {
      if (isTeamFive || isPrivatePathTracked) blockers.push(rel + ": oversized assessment file could not be inspected");
      continue;
    }
    const contents = readFileSync(full, "utf8");
    if (contents.includes("\u0000")) {
      if (isTeamFive || isPrivatePathTracked) blockers.push(rel + ": binary assessment file could not be inspected");
      continue;
    }
    const hasKeyField = keyField.test(contents);
    if (!hasKeyField) continue;
    if (isOldExcel) {
      knownDebts.push(rel + ": existing public Excel pilot answer bank still requires re-keying");
    } else if (isTeamFive) {
      blockers.push(rel + ": public team-five source contains evaluator answer fields");
    } else if (isPrivatePathTracked) {
      blockers.push(rel + ": private assessment bank was force-tracked into the public repository");
    } else if (activeSlugs.some((slug) => rel.includes(slug)) || (
      pathOutsideDrafts.test(rel) && activeSlugs.some((slug) => contents.includes(slug))
    )) {
      // Prevent simply moving the same five-course keyed bank elsewhere in the repo.
      blockers.push(rel + ": team-five evaluation key was relocated into another public asset");
    }
  }
  return { blockers, knownDebts };
}

export function assertNoPublicTeamFiveAssessmentKeyLeaks(repositoryRoot = root, options = {}) {
  const result = findPublicAssessmentKeyLeaks(repositoryRoot, options);
  if (result.knownDebts.length) {
    console.warn(
      "Known PUBLIC assessment-key debt (#281): " + result.knownDebts.length +
      " Excel pilot source file(s). Re-key before assessment publication."
    );
  }
  if (result.blockers.length) {
    throw new Error(
      "Public assessment bank security gate failed (#281):\n" + result.blockers.join("\n") +
      "\nNever commit evaluator keys to the public SkillUp repository."
    );
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assertNoPublicTeamFiveAssessmentKeyLeaks();
  console.log("SkillUp public assessment source scan passed (current tracked tree only).");
}