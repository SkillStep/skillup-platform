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
const codeowners = read(".github/CODEOWNERS");
const pullRequestTemplate = read(".github/pull_request_template.md");
const webDockerfile = read("infra/docker/web.Dockerfile");
const aiWorkerDockerfile = read("infra/docker/ai-worker.Dockerfile");
const environmentExample = read(".env.example");
const liveSmoke = read("tools/smoke-live.mjs");
const secretScan = read("tools/scan-secrets.mjs");
const pythonTestRunner = read("tools/run-python-tests.mjs");
const aiConfig = read("services/ai-worker/src/skillup_ai_worker/config.py");
const aiGateway = read("services/ai-worker/src/skillup_ai_worker/gateway.py");
const aiQueue = read("services/ai-worker/src/skillup_ai_worker/queue.py");
const aiPolicies = read("services/ai-worker/src/skillup_ai_worker/policies.py");
const aiEvaluation = read("services/ai-worker/evaluation/fixtures.jsonl");
const commercialService = read("apps/api/src/commercial.ts");
const adminService = read("apps/api/src/admin.ts");
const commercialMigration = read("packages/database/drizzle/0008_launch_commercial_operations.sql");
const pricingPage = read("apps/web/app/[locale]/pricing/page.tsx");
const accountPage = read("apps/web/app/[locale]/account/page.tsx");
const adminPage = read("apps/web/app/[locale]/admin/page.tsx");

const requiredOperationsDocuments = [
  "docs/operations/PRODUCTION_READINESS.md",
  "docs/operations/INCIDENT_RESPONSE.md",
  "docs/operations/BACKUP_RESTORE.md",
  "docs/operations/RELEASE_ROLLBACK.md",
  "docs/operations/ACCESS_AND_SECRETS.md",
  "docs/operations/OBSERVABILITY.md",
  "docs/operations/RELEASE_EVIDENCE_TEMPLATE.md",
  "docs/operations/MANUAL_LAUNCH_TEST_PLAN.md",
  "docs/ai/AI_PROVIDER_GATEWAY.md",
  "docs/ai/AI_PRIVACY_AND_COST_POLICY.md",
  "docs/ai/AI_MODEL_APPROVAL_RUNBOOK.md",
  "docs/ai/AI_WORKER_OPERATIONS.md",
  "docs/payments/JAZZCASH_INTEGRATION.md",
  "docs/admin/ADMIN_BOOTSTRAP_AND_ACCESS.md",
];
for (const path of requiredOperationsDocuments) read(path);

for (const required of [
  "FEATURE_AI_GENERATION_ENABLED=false",
  "FEATURE_PREMIUM_ENABLED=false",
  "FEATURE_JAZZCASH_ENABLED=false",
  "AI_PROVIDER=disabled",
  "AI_FALLBACK_PROVIDER=disabled",
  "AI_MAX_COST_USD_PER_JOB=0.02",
  "AI_EVALUATION_LIVE=false",
  "JAZZCASH_MODE=disabled",
  "JAZZCASH_PAYMENT_URL=",
  "JAZZCASH_RETURN_URL=",
]) {
  requireText(environmentExample, required, ".env.example");
}

requireText(
  webDockerfile,
  "/workspace/apps/web/public ./apps/web/public",
  "web production Dockerfile",
);
requireText(aiWorkerDockerfile, "USER skillup-ai", "AI worker production Dockerfile");
requireText(aiWorkerDockerfile, "skillup_ai_worker.health", "AI worker production Dockerfile");
requireText(workflow, "Reject high-severity production dependency findings", "Quality CI");
requireText(workflow, "pnpm audit --prod --audit-level=high", "Quality CI");
requireText(workflow, "Build reviewed production containers", "Quality CI");
requireText(workflow, "skillup-ai-worker:${{ github.sha }}", "Quality CI");
requireText(workflow, "Smoke disabled AI worker image", "Quality CI");
requireText(workflow, "pnpm smoke:live", "Quality CI");
requireText(workflow, "pnpm release:evidence", "Quality CI");
requireText(workflow, "actions/upload-artifact@", "Quality CI");
rejectText(workflow, "skillup-api:latest", "Quality CI");
rejectText(workflow, "skillup-web:latest", "Quality CI");
rejectText(workflow, "skillup-ai-worker:latest", "Quality CI");

requireText(codeowners, "/.github/", "CODEOWNERS");
requireText(codeowners, "/apps/api/", "CODEOWNERS");
requireText(codeowners, "/packages/database/", "CODEOWNERS");
requireText(pullRequestTemplate, "## Risk review", "pull request template");
requireText(pullRequestTemplate, "## Deployment and recovery", "pull request template");
requireText(secretScan, "PRIVATE KEY", "committed-secret scan");
requireText(secretScan, "GitHub token", "committed-secret scan");

requireText(liveSmoke, "Content-Security-Policy", "live production smoke");
requireText(liveSmoke, "Strict-Transport-Security", "live production smoke");
requireText(liveSmoke, "robots.txt", "live production smoke");
requireText(liveSmoke, "sitemap.xml", "live production smoke");
requireText(liveSmoke, "Skip to main content", "live production smoke");

requireText(pythonTestRunner, "skillup_ai_worker.evaluate", "Python quality gate");
requireText(pythonTestRunner, "error::ResourceWarning", "Python quality gate");
requireText(aiConfig, "FEATURE_AI_GENERATION_ENABLED", "AI worker configuration");
requireText(aiGateway, "self.store.reserve(", "AI gateway budget reservation");
requireText(aiGateway, "CircuitBreakers", "AI gateway circuit breaker");
requireText(aiQueue, "lease", "AI durable queue");
requireText(aiQueue, "cancel", "AI durable queue");
requireText(aiPolicies, "deepseek-v4-flash", "AI model policy");
requireText(aiPolicies, "openrouter/free", "AI model policy");
requireText(aiEvaluation, "translation-communication-ur-v1", "AI evaluation fixture set");

requireText(commercialMigration, "payment_events_append_only", "commercial migration");
requireText(commercialMigration, "entitlement_events_append_only", "commercial migration");
requireText(commercialMigration, "privileged_audit_events_append_only", "commercial migration");
requireText(
  commercialMigration,
  "ai_generated_artifacts_immutable_original",
  "commercial migration",
);
requireText(commercialMigration, "active_user_capabilities", "commercial migration");
requireText(commercialService, "verifyJazzCashSecureHash", "commercial service");
requireText(commercialService, "source_order_id", "commercial service entitlement idempotency");
requireText(commercialService, "reconciliation_cases", "commercial service reconciliation");
requireText(adminService, "Missing administrative capability", "admin authorization");
requireText(adminService, "ai.artifact.publish", "admin publication audit");
requireText(adminService, "entitlement.correct", "admin entitlement audit");
requireText(pricingPage, "SkillUp Premium pricing", "public pricing page");
requireText(accountPage, "robots: { index: false", "private membership page");
requireText(adminPage, "robots: { index: false", "private admin page");

for (const script of [
  "production:check",
  "security:secrets",
  "release:evidence",
  "admin:bootstrap",
]) {
  if (!packageJson.scripts?.[script]) throw new Error(`Root scripts must expose ${script}.`);
}
requireText(
  packageJson.scripts["container:build"],
  "ai-worker.Dockerfile",
  "container build script",
);

console.log("SkillUp pre-deployment production-readiness contract passed.");
