import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const STAGING_HOST = "skillupshop.codistan.org";
const DEFAULT_REQUESTS_PER_TARGET = 30;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_P95_MS = 1_500;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_REQUESTS_PER_TARGET = 100;
const MAX_CONCURRENCY = 20;

function positiveInteger(name, fallback, maximum) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Math.round(sorted[index]);
}

function endpoint(base, pathname) {
  return new URL(pathname, `${base.replace(/\/$/, "")}/`).toString();
}

const webUrl = process.env.STAGING_WEB_URL?.trim();
if (!webUrl) throw new Error("STAGING_WEB_URL is required.");

const parsedWebUrl = new URL(webUrl);
if (parsedWebUrl.protocol !== "https:" || parsedWebUrl.hostname !== STAGING_HOST) {
  throw new Error(`Capacity smoke is locked to https://${STAGING_HOST}.`);
}

const requestsPerTarget = positiveInteger(
  "STAGING_CAPACITY_REQUESTS_PER_TARGET",
  DEFAULT_REQUESTS_PER_TARGET,
  MAX_REQUESTS_PER_TARGET,
);
const concurrency = positiveInteger(
  "STAGING_CAPACITY_CONCURRENCY",
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
);
const p95BudgetMs = positiveInteger("STAGING_CAPACITY_P95_MS", DEFAULT_P95_MS, REQUEST_TIMEOUT_MS);

const targets = [
  { name: "web_health", path: "/api/health", accept: "application/json" },
  { name: "api_health", path: "/api/v1/health", accept: "application/json" },
  { name: "api_ready", path: "/api/v1/ready", accept: "application/json" },
  { name: "launch_catalog", path: "/en/skills", accept: "text/html" },
];

const jobs = targets.flatMap((target) => Array.from({ length: requestsPerTarget }, () => target));
const observations = new Map(
  targets.map((target) => [target.name, { durations: [], failures: [] }]),
);

let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const jobIndex = cursor;
    cursor += 1;
    const target = jobs[jobIndex];
    const started = performance.now();
    try {
      const response = await fetch(endpoint(webUrl, target.path), {
        headers: {
          accept: target.accept,
          "user-agent": "SkillUp-Staging-Capacity-Smoke/1.0",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      await response.arrayBuffer();
      const duration = performance.now() - started;
      observations.get(target.name).durations.push(duration);
      if (response.status !== 200) {
        observations.get(target.name).failures.push(`HTTP ${response.status}`);
      }
    } catch (error) {
      const duration = performance.now() - started;
      observations.get(target.name).durations.push(duration);
      observations
        .get(target.name)
        .failures.push(error instanceof Error ? error.message : "unknown request failure");
    }
  }
}

const runStartedAt = new Date().toISOString();
const wallStarted = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
const wallDurationMs = Math.round(performance.now() - wallStarted);

const targetResults = targets.map((target) => {
  const observation = observations.get(target.name);
  const durations = observation.durations;
  return {
    name: target.name,
    path: target.path,
    requests: durations.length,
    failures: observation.failures.length,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: Math.round(Math.max(...durations, 0)),
  };
});

const result = {
  schemaVersion: "skillup-staging-capacity-v1",
  generatedAt: new Date().toISOString(),
  runStartedAt,
  stagingHost: parsedWebUrl.hostname,
  readOnly: true,
  requestsPerTarget,
  totalRequests: jobs.length,
  concurrency,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  p95BudgetMs,
  wallDurationMs,
  targets: targetResults,
};

const artifactDirectory = path.resolve(
  process.cwd(),
  process.env.STAGING_CERTIFICATION_ARTIFACT_DIR ?? "artifacts/staging-certification",
);
await fs.mkdir(artifactDirectory, { recursive: true });
await fs.writeFile(
  path.join(artifactDirectory, "capacity.json"),
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(result, null, 2));

const failedTargets = targetResults.filter(
  (target) => target.failures > 0 || target.p95Ms > p95BudgetMs,
);
if (failedTargets.length > 0) {
  throw new Error(
    `Staging capacity smoke failed: ${failedTargets
      .map(
        (target) =>
          `${target.name} failures=${target.failures} p95=${target.p95Ms}ms budget=${p95BudgetMs}ms`,
      )
      .join("; ")}`,
  );
}

console.log(
  `STAGING CAPACITY SMOKE: PASS (${jobs.length} read-only requests, concurrency ${concurrency}, p95 budget ${p95BudgetMs}ms)`,
);
