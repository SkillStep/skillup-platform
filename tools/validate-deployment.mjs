import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) throw new Error(`${label} must contain ${expected}`);
}

function rejectText(source, forbidden, label) {
  if (source.includes(forbidden)) throw new Error(`${label} must not contain ${forbidden}`);
}

const apiDockerfile = read("infra/docker/api.Dockerfile");
const webDockerfile = read("infra/docker/web.Dockerfile");
const aiWorkerDockerfile = read("infra/docker/ai-worker.Dockerfile");
const apiRailway = JSON.parse(read("infra/railway/api.railway.json"));
const webRailway = JSON.parse(read("infra/railway/web.railway.json"));
const aiWorkerRailway = JSON.parse(read("infra/railway/ai-worker.railway.json"));
const environmentExample = read(".env.example");
const proxy = read("apps/web/app/api/v1/[...path]/route.ts");

for (const [label, dockerfile] of [
  ["API Dockerfile", apiDockerfile],
  ["web Dockerfile", webDockerfile],
]) {
  requireText(dockerfile, "FROM node:24.18.0-bookworm-slim", label);
  requireText(dockerfile, "pnpm install --frozen-lockfile", label);
  requireText(dockerfile, "USER node", label);
  requireText(dockerfile, "HEALTHCHECK", label);
  rejectText(dockerfile, "COPY .env", label);
  rejectText(dockerfile, "--no-frozen-lockfile", label);
}
requireText(
  webDockerfile,
  "/workspace/apps/web/public ./apps/web/public",
  "web production Dockerfile",
);

requireText(aiWorkerDockerfile, "FROM python:3.13.14-slim-bookworm", "AI worker Dockerfile");
requireText(aiWorkerDockerfile, "USER skillup-ai", "AI worker Dockerfile");
requireText(aiWorkerDockerfile, "HEALTHCHECK", "AI worker Dockerfile");
requireText(
  aiWorkerDockerfile,
  'CMD ["python", "-m", "skillup_ai_worker.worker"]',
  "AI worker Dockerfile",
);
rejectText(aiWorkerDockerfile, "COPY .env", "AI worker Dockerfile");

if (apiRailway.build?.dockerfilePath !== "/infra/docker/api.Dockerfile") {
  throw new Error("Railway API config must select the reviewed API Dockerfile.");
}
if (apiRailway.deploy?.healthcheckPath !== "/v1/ready") {
  throw new Error("Railway API config must gate traffic on database-backed readiness.");
}
if (!Array.isArray(apiRailway.deploy?.preDeployCommand)) {
  throw new Error("Railway API config must run checked-in migrations before deployment.");
}
if (webRailway.build?.dockerfilePath !== "/infra/docker/web.Dockerfile") {
  throw new Error("Railway web config must select the reviewed web Dockerfile.");
}
if (webRailway.deploy?.healthcheckPath !== "/api/health") {
  throw new Error("Railway web config must use the bounded web health endpoint.");
}
if (aiWorkerRailway.build?.dockerfilePath !== "/infra/docker/ai-worker.Dockerfile") {
  throw new Error("Railway AI worker config must select the reviewed worker Dockerfile.");
}
if (aiWorkerRailway.deploy?.startCommand !== "python -m skillup_ai_worker.worker") {
  throw new Error("Railway AI worker must run the continuous reviewed worker entrypoint.");
}
if (aiWorkerRailway.deploy?.restartPolicyType !== "ON_FAILURE") {
  throw new Error("Railway AI worker must restart only after failure.");
}
if (aiWorkerRailway.deploy?.overlapSeconds !== 0) {
  throw new Error("Railway AI worker must not overlap replicas while using a single worker lease.");
}

for (const required of [
  "EMAIL_PROVIDER=disabled",
  "SMTP_HOST=",
  "SMTP_PASSWORD=",
  "FEATURE_AI_GENERATION_ENABLED=false",
  "FEATURE_PREMIUM_ENABLED=false",
  "FEATURE_JAZZCASH_ENABLED=false",
  "AI_PROVIDER=disabled",
  "DEEPSEEK_MODEL=deepseek-v4-flash",
  "AI_MAX_COST_USD_PER_JOB=0.005",
  "AI_DAILY_BUDGET_USD=1",
  "AI_MONTHLY_BUDGET_USD=20",
  "AI_JOB_API_URL=http://localhost:3001",
  "AI_WORKER_SHARED_SECRET=",
  "MAINTENANCE_INTERVAL_SECONDS=60",
  "JAZZCASH_MODE=disabled",
  "RELEASE_SHA=local",
]) {
  requireText(environmentExample, required, ".env.example");
}

requireText(proxy, 'process.env["API_BASE_URL"]', "runtime API proxy");
requireText(proxy, 'cache: "no-store"', "runtime API proxy");
rejectText(proxy, "NEXT_PUBLIC_API", "runtime API proxy");

console.log("SkillUp deployment contract validation passed.");
