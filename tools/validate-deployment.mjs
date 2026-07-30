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
const apiRailway = JSON.parse(read("infra/railway/api.railway.json"));
const webRailway = JSON.parse(read("infra/railway/web.railway.json"));
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

for (const required of [
  "EMAIL_PROVIDER=disabled",
  "SMTP_HOST=",
  "SMTP_PASSWORD=",
  "FEATURE_AI_GENERATION_ENABLED=false",
  "FEATURE_PREMIUM_ENABLED=false",
  "FEATURE_JAZZCASH_ENABLED=false",
  "AI_PROVIDER=disabled",
  "JAZZCASH_MODE=disabled",
  "RELEASE_SHA=local",
]) {
  requireText(environmentExample, required, ".env.example");
}

requireText(proxy, 'process.env["API_BASE_URL"]', "runtime API proxy");
requireText(proxy, 'cache: "no-store"', "runtime API proxy");
rejectText(proxy, "NEXT_PUBLIC_API", "runtime API proxy");

console.log("SkillUp deployment contract validation passed.");
