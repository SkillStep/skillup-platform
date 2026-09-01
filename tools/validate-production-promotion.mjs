import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) throw new Error(`Required production-promotion file is missing: ${path}`);
  return readFileSync(absolute, "utf8");
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) throw new Error(`${label} must contain ${expected}`);
}

function rejectText(source, forbidden, label) {
  if (source.includes(forbidden)) throw new Error(`${label} must not contain ${forbidden}`);
}

const workflow = read(".github/workflows/promote-production.yml");
const compose = read("infra/docker/docker-compose.production.yml");
const runbook = read("docs/operations/PRODUCTION_DEPLOYMENT.md");

for (const required of [
  "workflow_dispatch:",
  "PROMOTE-CERTIFIED-STAGING-ARTIFACTS",
  "staging-certification/live",
  "Staging Deploy run",
  "actions/download-artifact@v4",
  "staging-deployment-identity-",
  "run-id:",
  "docker buildx imagetools inspect",
  "environment: production",
  "PRODUCTION_PUBLIC_URL",
  "infra/docker/docker-compose.production.yml",
  "Applying reviewed forward migrations",
  "PRODUCTION PUBLIC RELEASE IDENTITY: PASS",
  "providerActivationIncluded:false",
]) {
  requireText(workflow, required, "production promotion workflow");
}

for (const forbidden of [
  "\n  push:",
  "\n  schedule:",
  "docker/build-push-action",
  "docker build ",
  ":latest",
  "FEATURE_JAZZCASH_ENABLED=true",
  "FEATURE_AI_GENERATION_ENABLED=true",
  "FEATURE_PREMIUM_ENABLED=true",
]) {
  rejectText(workflow, forbidden, "production promotion workflow");
}

for (const required of [
  "name: skillup-production",
  "${API_RELEASE_ARTIFACT_REF:?API_RELEASE_ARTIFACT_REF is required}",
  "${WEB_RELEASE_ARTIFACT_REF:?WEB_RELEASE_ARTIFACT_REF is required}",
  "${AI_RELEASE_ARTIFACT_REF:?AI_RELEASE_ARTIFACT_REF is required}",
  '"127.0.0.1:4021:3001"',
  '"127.0.0.1:3021:3000"',
  "no-new-privileges:true",
  "skillup_production_ai_worker_data",
]) {
  requireText(compose, required, "production compose contract");
}

for (const forbidden of [
  "build:",
  ":latest",
  ":staging",
  "skillup_staging_postgres_data",
  "container_name: skillup-postgres",
]) {
  rejectText(compose, forbidden, "production compose contract");
}

for (const required of [
  "Only a full 40-character commit SHA",
  "without rebuilding",
  "protected GitHub environment",
  "Production PostgreSQL is managed externally",
  "Provider flags and credentials are never enabled",
  "isolated restore drill",
  "Gradual traffic opening",
  "Rollback",
]) {
  requireText(runbook, required, "production deployment runbook");
}

console.log("SkillUp guarded production-promotion contract passed.");
