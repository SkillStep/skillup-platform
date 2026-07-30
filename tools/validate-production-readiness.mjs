import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  const absolutePath = resolve(root, path);
  if (!existsSync(absolutePath)) throw new Error(`Required production file is missing: ${path}`);
  return readFileSync(absolutePath, "utf8");
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) throw new Error(`${label} must contain ${expected}`);
}

function rejectText(source, forbidden, label) {
  if (source.includes(forbidden)) throw new Error(`${label} must not contain ${forbidden}`);
}

const packageJson = JSON.parse(read("package.json"));
const workflow = read(".github/workflows/foundation.yml");
const webDockerfile = read("infra/docker/web.Dockerfile");
const environmentExample = read(".env.example");
const liveSmoke = read("tools/smoke-live.mjs");

const requiredOperationsDocuments = [
  "docs/operations/PRODUCTION_READINESS.md",
  "docs/operations/INCIDENT_RESPONSE.md",
  "docs/operations/BACKUP_RESTORE.md",
  "docs/operations/RELEASE_ROLLBACK.md",
  "docs/operations/ACCESS_AND_SECRETS.md",
  "docs/operations/OBSERVABILITY.md",
  "docs/operations/RELEASE_EVIDENCE_TEMPLATE.md",
];
for (const path of requiredOperationsDocuments) read(path);

for (const required of [
  "FEATURE_AI_GENERATION_ENABLED=false",
  "FEATURE_PREMIUM_ENABLED=false",
  "FEATURE_JAZZCASH_ENABLED=false",
  "AI_PROVIDER=disabled",
  "JAZZCASH_MODE=disabled",
]) {
  requireText(environmentExample, required, ".env.example");
}

requireText(
  webDockerfile,
  "/workspace/apps/web/public ./apps/web/public",
  "web production Dockerfile",
);
requireText(workflow, "Run production containers and end-to-end smoke", "Quality CI");
requireText(workflow, "pnpm smoke:live", "Quality CI");
requireText(workflow, "pnpm release:evidence", "Quality CI");
requireText(workflow, "actions/upload-artifact@", "Quality CI");
rejectText(workflow, "skillup-api:latest", "Quality CI");
rejectText(workflow, "skillup-web:latest", "Quality CI");

requireText(liveSmoke, "Content-Security-Policy", "live production smoke");
requireText(liveSmoke, "Strict-Transport-Security", "live production smoke");
requireText(liveSmoke, "robots.txt", "live production smoke");
requireText(liveSmoke, "sitemap.xml", "live production smoke");
requireText(liveSmoke, "Skip to main content", "live production smoke");

if (!packageJson.scripts?.["production:check"] || !packageJson.scripts?.["release:evidence"]) {
  throw new Error("Root scripts must expose production:check and release:evidence.");
}

console.log("SkillUp pre-deployment production-readiness contract passed.");
