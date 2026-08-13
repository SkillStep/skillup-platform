import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRoot = path.join(root, "qa", "staging-certification");
const artifacts = path.resolve(
  root,
  process.env.STAGING_CERTIFICATION_ARTIFACT_DIR ?? "artifacts/staging-certification",
);
const runId = process.env.STAGING_QA_RUN_ID ?? process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;

const summary = {
  schemaVersion: "skillup-staging-certification-v1",
  runId,
  generatedAt: new Date().toISOString(),
  decision: "BLOCKED",
  expected: {},
  observed: {},
  areas: {},
};

function bool(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function value(name) {
  return process.env[name]?.trim() ?? "";
}

function setArea(name, status, detail) {
  summary.areas[name] = { status, detail };
}

function hasStatus(status) {
  return Object.values(summary.areas).some((area) => area.status === status);
}

function endpoint(base, pathname) {
  return new URL(pathname, `${base.replace(/\/$/, "")}/`).toString();
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "SkillUp-Staging-Certification/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  return response.json();
}

function requireMetadata(actual, expected, label) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!expectedValue) continue;
    if (actual?.[key] !== expectedValue) {
      throw new Error(
        `${label} ${key} mismatch: expected ${expectedValue}, received ${String(actual?.[key])}.`,
      );
    }
  }
}

async function writeSummary() {
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(
    path.join(artifacts, "certification.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );

  const lines = [
    "# SkillUp staging certification",
    "",
    `- QA run: ${summary.runId}`,
    `- Generated: ${summary.generatedAt}`,
    `- Decision: **${summary.decision}**`,
    "",
    "| Area | Status | Detail |",
    "| --- | --- | --- |",
    ...Object.entries(summary.areas).map(
      ([name, area]) =>
        `| ${name.replaceAll("|", "\\|")} | ${area.status} | ${String(area.detail).replaceAll("|", "\\|").replaceAll("\n", " ")} |`,
    ),
    "",
  ];
  await fs.writeFile(path.join(artifacts, "certification.md"), `${lines.join("\n")}\n`, "utf8");
}

function blockForMissingConfiguration() {
  const required = [
    "STAGING_WEB_URL",
    "STAGING_EXPECTED_RELEASE_SHA",
    "STAGING_DEPLOYMENT_PIPELINE_ID",
    "STAGING_WEB_ARTIFACT_REF",
    "STAGING_WEB_IMAGE_DIGEST",
    "STAGING_API_ARTIFACT_REF",
    "STAGING_API_IMAGE_DIGEST",
    "STAGING_PREVIOUS_RELEASE_REF",
  ];
  const missing = required.filter((name) => !value(name));
  if (missing.length > 0) {
    setArea("deployment_identity", "BLOCKED", `Missing required inputs: ${missing.join(", ")}`);
  }

  if (bool("STAGING_REQUIRE_EMAIL", true)) {
    const emailRequired = [
      "STAGING_QA_LEARNER_EMAIL",
      "STAGING_QA_FREE_LEARNER_EMAIL",
      "STAGING_QA_ONBOARDING_EMAIL",
      "STAGING_QA_AUTH_NEGATIVE_EMAIL",
      "STAGING_QA_SESSION_EMAIL",
      "STAGING_QA_ADMIN_EMAIL",
      "STAGING_QA_ANALYST_EMAIL",
      "STAGING_QA_CONTENT_EDITOR_EMAIL",
      "STAGING_QA_CONTENT_REVIEWER_EMAIL",
      "STAGING_QA_PUBLISHER_EMAIL",
      "STAGING_QA_PAYMENT_OPERATOR_EMAIL",
      "STAGING_QA_LEARNER_SUPPORT_EMAIL",
      "STAGING_QA_SECURITY_ADMIN_EMAIL",
      "STAGING_QA_REVOKED_ADMIN_EMAIL",
      "STAGING_QA_MAILBOX_URL",
      "STAGING_QA_MAILBOX_TOKEN",
    ];
    const emailMissing = emailRequired.filter((name) => !value(name));
    if (!bool("STAGING_EMAIL_PROVIDER_READY") || emailMissing.length > 0) {
      setArea(
        "authentication",
        "BLOCKED",
        emailMissing.length > 0
          ? `Staging OTP certification inputs missing: ${emailMissing.join(", ")}`
          : "Staging SMTP/OTP provider has not been marked ready.",
      );
    }
  }

  if (!bool("STAGING_QA_LEARNER_PREMIUM_READY")) {
    setArea(
      "learner_fixture",
      "BLOCKED",
      "The staging QA learner must have an audited non-production Premium entitlement so all launch levels can be exercised without the daily free limit.",
    );
  }

  if (bool("STAGING_REQUIRE_AI", true)) {
    const aiRequired = [
      "STAGING_AI_RELEASE_SHA",
      "STAGING_AI_ARTIFACT_REF",
      "STAGING_AI_IMAGE_DIGEST",
    ];
    const aiMissing = aiRequired.filter((name) => !value(name));
    if (!bool("STAGING_DEEPSEEK_READY") || aiMissing.length > 0) {
      setArea(
        "ai_provider",
        "BLOCKED",
        aiMissing.length > 0
          ? `AI deployment identity inputs missing: ${aiMissing.join(", ")}`
          : "DeepSeek staging integration has not been marked ready.",
      );
    } else if (value("STAGING_AI_RELEASE_SHA") !== value("STAGING_EXPECTED_RELEASE_SHA")) {
      setArea("ai_provider", "BLOCKED", "AI worker release SHA does not match the candidate SHA.");
    }
  }

  if (bool("STAGING_REQUIRE_JAZZCASH", true) && !bool("STAGING_JAZZCASH_SANDBOX_READY")) {
    setArea("payments", "BLOCKED", "PAYMENT SANDBOX NOT CONFIGURED");
  }

  if (bool("STAGING_REQUIRE_VISUALS", true) && !bool("STAGING_VISUAL_BASELINES_APPROVED")) {
    setArea(
      "visual_regression",
      "BLOCKED",
      "VISUAL REVIEW REQUIRED — approved baselines are missing.",
    );
  }
}

async function gateZero() {
  const webUrl = value("STAGING_WEB_URL");
  const expectedRelease = value("STAGING_EXPECTED_RELEASE_SHA");
  const pipelineId = value("STAGING_DEPLOYMENT_PIPELINE_ID");
  const expectedWeb = {
    releaseSha: expectedRelease,
    pipelineId,
    artifactRef: value("STAGING_WEB_ARTIFACT_REF"),
    imageDigest: value("STAGING_WEB_IMAGE_DIGEST"),
    rollbackRef: value("STAGING_PREVIOUS_RELEASE_REF"),
  };
  const expectedApi = {
    releaseSha: expectedRelease,
    pipelineId,
    artifactRef: value("STAGING_API_ARTIFACT_REF"),
    imageDigest: value("STAGING_API_IMAGE_DIGEST"),
    rollbackRef: value("STAGING_PREVIOUS_RELEASE_REF"),
  };

  summary.expected = {
    releaseSha: expectedRelease,
    pipelineId,
    webArtifactRef: expectedWeb.artifactRef,
    webImageDigest: expectedWeb.imageDigest,
    apiArtifactRef: expectedApi.artifactRef,
    apiImageDigest: expectedApi.imageDigest,
    aiArtifactRef: value("STAGING_AI_ARTIFACT_REF") || null,
    aiImageDigest: value("STAGING_AI_IMAGE_DIGEST") || null,
    rollbackRef: expectedWeb.rollbackRef,
  };

  try {
    const [webHealth, apiVersion] = await Promise.all([
      fetchJson(endpoint(webUrl, "/api/health"), "Web health"),
      fetchJson(endpoint(webUrl, "/api/v1/version"), "Proxied API version"),
    ]);
    requireMetadata(webHealth, expectedWeb, "Web");
    requireMetadata(apiVersion, expectedApi, "API");

    summary.observed.web = webHealth;
    summary.observed.api = apiVersion;

    const directApiUrl = value("STAGING_API_URL");
    if (directApiUrl) {
      const directVersion = await fetchJson(
        endpoint(directApiUrl, "/v1/version"),
        "Direct API version",
      );
      requireMetadata(directVersion, expectedApi, "Direct API");
      summary.observed.directApi = directVersion;
    }

    setArea(
      "deployment_identity",
      "PASS",
      "Running Web/API metadata matches the expected SHA, pipeline, immutable artifact references and digests.",
    );
  } catch (error) {
    setArea(
      "deployment_identity",
      "BLOCKED",
      error instanceof Error ? error.message : "Running artifact identity could not be proven.",
    );
  }
}

async function runtimePreflight() {
  const webUrl = value("STAGING_WEB_URL");
  try {
    const ready = await fetchJson(endpoint(webUrl, "/api/v1/ready"), "API readiness");
    if (ready.status !== "ok") throw new Error("API readiness did not report status=ok.");

    const skills = await fetch(endpoint(webUrl, "/en/skills"), {
      headers: { accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!skills.ok) throw new Error(`Skills page returned HTTP ${skills.status}.`);
    const html = await skills.text();
    for (const title of [
      "Interview and Workplace Communication",
      "Practical English for Study and Work",
      "AI Tools for Study and Work",
      "Freelancing Foundations",
      "Digital Marketing Foundations",
    ]) {
      if (!html.includes(title))
        throw new Error(`Reviewed launch skill missing from staging: ${title}.`);
    }

    setArea(
      "api_runtime",
      "PASS",
      "Web responds, API DB-backed readiness is healthy and all five reviewed launch skills are available.",
    );
  } catch (error) {
    setArea(
      "api_runtime",
      "FAIL",
      error instanceof Error ? error.message : "Runtime preflight failed.",
    );
  }
}

function runCommand(command, args, environment) {
  return spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...environment },
    encoding: "utf8",
    stdio: "inherit",
  });
}

function failedPlaywrightTests() {
  return fs
    .readFile(path.join(qaRoot, "artifacts", "playwright-results.json"), "utf8")
    .then((content) => JSON.parse(content))
    .then((report) => {
      const failures = [];
      const visit = (suite) => {
        for (const spec of suite.specs ?? []) {
          for (const test of spec.tests ?? []) {
            for (const result of test.results ?? []) {
              if (result.status === "failed" || result.status === "timedOut") {
                failures.push({ title: spec.title, project: test.projectName ?? "unknown" });
              }
            }
          }
        }
        for (const child of suite.suites ?? []) visit(child);
      };
      for (const suite of report.suites ?? []) visit(suite);
      return failures;
    })
    .catch(() => []);
}

async function browserCertification() {
  const smoke = runCommand("node", ["tools/smoke-live.mjs"], {
    SKILLUP_WEB_URL: value("STAGING_WEB_URL"),
    SKILLUP_API_URL: value("STAGING_API_URL"),
    SKILLUP_EXPECTED_RELEASE_SHA: value("STAGING_EXPECTED_RELEASE_SHA"),
  });
  if (smoke.status !== 0) {
    setArea("http_smoke", "FAIL", "Existing deployed live-smoke contract failed.");
    return;
  }
  setArea("http_smoke", "PASS", "Existing deployed live-smoke contract passed.");

  const playwright = runCommand("pnpm", ["--filter", "@skillup/staging-certification", "certify"], {
    STAGING_QA_RUN_ID: runId,
  });
  if (playwright.status === 0) {
    setArea("playwright", "PASS", "All mandatory Playwright projects passed with zero retries.");
    if (bool("STAGING_REQUIRE_VISUALS", true)) {
      setArea("visual_regression", "PASS", "Approved screenshot baselines matched.");
    }
    return;
  }

  const failures = await failedPlaywrightTests();
  const visualOnly =
    failures.length > 0 && failures.every((failure) => failure.title.includes("@visual"));
  if (visualOnly) {
    setArea(
      "visual_regression",
      "BLOCKED",
      `VISUAL REVIEW REQUIRED — ${failures.length} approved baseline comparison(s) changed.`,
    );
  } else {
    const names = failures.slice(0, 8).map((failure) => `${failure.project}: ${failure.title}`);
    setArea(
      "playwright",
      "FAIL",
      names.length > 0 ? `Failed: ${names.join("; ")}` : "Playwright certification failed.",
    );
  }
}

blockForMissingConfiguration();

if (!summary.areas.deployment_identity) {
  await gateZero();
}

if (!hasStatus("BLOCKED")) {
  await runtimePreflight();
}

if (!hasStatus("BLOCKED") && !hasStatus("FAIL")) {
  await browserCertification();
}

summary.decision = hasStatus("FAIL")
  ? "FAILED"
  : hasStatus("BLOCKED")
    ? "BLOCKED"
    : "READY FOR UAT";
await writeSummary();
console.log(summary.decision);

if (summary.decision === "READY FOR UAT") process.exit(0);
process.exit(summary.decision === "BLOCKED" ? 2 : 1);
