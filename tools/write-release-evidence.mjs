import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(root, "artifacts");
const outputPath = resolve(outputDirectory, "release-evidence.json");

function optionalEnvironment(name) {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

const releaseSha =
  optionalEnvironment("RELEASE_SHA") ?? optionalEnvironment("GITHUB_SHA") ?? "local";
const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  environment: "ci-production-like",
  deploymentPerformed: false,
  source: {
    repository: optionalEnvironment("GITHUB_REPOSITORY"),
    commitSha: releaseSha,
    workflow: optionalEnvironment("GITHUB_WORKFLOW"),
    runId: optionalEnvironment("GITHUB_RUN_ID"),
    runAttempt: optionalEnvironment("GITHUB_RUN_ATTEMPT"),
    ref: optionalEnvironment("GITHUB_REF"),
  },
  runtime: {
    runnerOs: optionalEnvironment("RUNNER_OS"),
    nodeVersion: process.version,
    apiImageId: optionalEnvironment("SKILLUP_API_IMAGE_ID"),
    webImageId: optionalEnvironment("SKILLUP_WEB_IMAGE_ID"),
  },
  featureBoundary: {
    aiGeneration: "disabled",
    premium: "disabled",
    jazzCash: "disabled",
  },
  checks: [
    "locked dependency installation",
    "reviewed PostgreSQL migrations and deterministic seed",
    "database and pilot journey smoke",
    "foundation and deployment contracts",
    "format, lint and strict TypeScript",
    "unit and integration tests",
    "production application builds",
    "non-root production container builds",
    "production-container web and API end-to-end smoke",
    "public/private cache and indexing boundaries",
    "security-header and release-identity assertions",
  ],
  remainingHumanActions: [
    "approve production security and accessibility sign-off",
    "configure production infrastructure, DNS and secrets",
    "perform isolated restore and rollback drills against the selected provider",
    "approve traffic promotion",
  ],
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(outputPath);
