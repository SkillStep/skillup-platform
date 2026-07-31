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
  schemaVersion: 2,
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
    aiWorkerImageId: optionalEnvironment("SKILLUP_AI_WORKER_IMAGE_ID"),
  },
  featureBoundary: {
    aiGeneration: "disabled-pending-provider-and-model-approval",
    premium: "disabled",
    jazzCash: "disabled",
  },
  checks: [
    "locked dependency installation",
    "reviewed PostgreSQL migrations and deterministic seed",
    "database and pilot journey smoke",
    "signed payment success, replay, mismatch reconciliation and refund lifecycle smoke",
    "foundation and deployment contracts",
    "committed-secret and high-severity dependency scans",
    "format, lint and strict TypeScript",
    "unit and integration tests",
    "deterministic AI gateway evaluation fixtures",
    "AI privacy, schema, cost, retry, fallback, circuit and queue tests",
    "non-root production API, web and AI worker images",
    "production-container web and API end-to-end smoke",
    "disabled AI worker health smoke without provider credentials",
    "public/private cache and indexing boundaries",
    "security-header and release-identity assertions",
  ],
  remainingHumanActions: [
    "approve production security and accessibility sign-off",
    "approve provider contract, data-processing terms and minimized data-sharing policy",
    "approve each live provider/model/task evaluation and cost ceiling",
    "configure production infrastructure, DNS, persistent AI worker storage and secrets",
    "perform isolated restore, provider-failover and rollback drills",
    "approve traffic and AI feature promotion",
  ],
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(outputPath);
