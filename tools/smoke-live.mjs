const webUrlInput = process.env["SKILLUP_WEB_URL"];
const apiUrlInput = process.env["SKILLUP_API_URL"];
const expectedRelease = process.env["SKILLUP_EXPECTED_RELEASE_SHA"];
const timeoutMilliseconds = Number(process.env["SKILLUP_SMOKE_TIMEOUT_MS"] ?? 15_000);

if (!webUrlInput) {
  throw new Error("SKILLUP_WEB_URL is required, for example https://staging.skillup.example.");
}
if (
  !Number.isInteger(timeoutMilliseconds) ||
  timeoutMilliseconds < 1_000 ||
  timeoutMilliseconds > 60_000
) {
  throw new Error("SKILLUP_SMOKE_TIMEOUT_MS must be an integer between 1000 and 60000.");
}

function baseUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error(`${label} must use HTTPS outside local development.`);
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

const webBase = baseUrl(webUrlInput, "SKILLUP_WEB_URL");
const directApiBase = apiUrlInput ? baseUrl(apiUrlInput, "SKILLUP_API_URL") : null;

function endpoint(base, path) {
  return new URL(path, `${base.toString().replace(/\/$/, "")}/`);
}

async function request(path, options = {}) {
  const url = endpoint(options.base ?? webBase, path);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    redirect: options.redirect ?? "follow",
    headers: {
      accept: options.accept ?? "application/json, text/html;q=0.9",
      "user-agent": "SkillUp-Deployment-Smoke/1.0",
    },
    signal: AbortSignal.timeout(timeoutMilliseconds),
  });

  if (response.status !== (options.status ?? 200)) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(
      `${url} returned ${response.status}; expected ${options.status ?? 200}. Body: ${body}`,
    );
  }
  return response;
}

async function json(path, options = {}) {
  const response = await request(path, { ...options, accept: "application/json" });
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    throw new Error(`${endpoint(options.base ?? webBase, path)} did not return JSON.`);
  }
  return { response, body: await response.json() };
}

function requireEqual(actual, expected, label) {
  if (actual !== expected)
    throw new Error(`${label}: expected ${expected}, received ${String(actual)}.`);
}

function requireContains(actual, expected, label) {
  if (!actual.includes(expected)) throw new Error(`${label} must contain ${expected}.`);
}

function requirePublicCacheBoundary(response, label) {
  requireEqual(response.headers.get("x-skillup-cacheable"), "public", `${label} cache boundary`);
  const cacheControl = (response.headers.get("cache-control") ?? "").toLowerCase();
  if (cacheControl.includes("private") || cacheControl.includes("no-store")) {
    throw new Error(`${label} unexpectedly uses a private cache policy: ${cacheControl}`);
  }
}

const webHealth = await json("/api/health");
requireEqual(webHealth.body.status, "ok", "Web health status");
requireEqual(webHealth.body.service, "skillup-web", "Web health service");
requireContains(
  webHealth.response.headers.get("cache-control") ?? "",
  "no-store",
  "Web health cache policy",
);

const homepage = await request("/en", { accept: "text/html" });
const homepageHtml = await homepage.text();
requireContains(homepageHtml, "Learn useful skills in short, focused games.", "Homepage HTML");
requireContains(homepageHtml, "Practical learning for Pakistan", "Homepage positioning");
requirePublicCacheBoundary(homepage, "Homepage");

const skills = await request("/en/skills", { accept: "text/html" });
const skillsHtml = await skills.text();
for (const title of [
  "Interview and Workplace Communication",
  "Practical English for Study and Work",
  "AI Tools for Study and Work",
  "Freelancing Foundations",
  "Digital Marketing Foundations",
]) {
  requireContains(skillsHtml, title, "Server-rendered skill catalog");
}
requireContains(skillsHtml, "application/ld+json", "Skill catalog structured data");
requirePublicCacheBoundary(skills, "Skill catalog");

const pilotSkill = await request("/en/skills/interview-workplace-communication", {
  accept: "text/html",
});
const pilotSkillHtml = await pilotSkill.text();
requireContains(pilotSkillHtml, "Answer common interview questions with evidence.", "Pilot skill outcomes");
requireContains(pilotSkillHtml, "LearningResource", "Pilot skill structured data");
requirePublicCacheBoundary(pilotSkill, "Pilot skill");

const pilotPath = await request("/en/paths/interview-workplace-communication", {
  accept: "text/html",
});
const pilotPathHtml = await pilotPath.text();
requireContains(pilotPathHtml, "Interview answers with evidence", "Pilot path modules");
requireContains(pilotPathHtml, '"@type":"Course"', "Pilot path course data");
requirePublicCacheBoundary(pilotPath, "Pilot path");

const manifest = await json("/manifest.webmanifest");
requireEqual(manifest.body.display, "standalone", "PWA display mode");
requireEqual(manifest.body.start_url, "/en", "PWA start URL");
if (!Array.isArray(manifest.body.icons) || manifest.body.icons.length < 2) {
  throw new Error("PWA manifest must expose standard and maskable icons.");
}

const serviceWorker = await request("/sw.js", { accept: "application/javascript" });
const serviceWorkerSource = await serviceWorker.text();
for (const privatePrefix of ["/api", "/en/sign-in", "/en/progress", "/en/learn"]) {
  requireContains(serviceWorkerSource, `"${privatePrefix}"`, "Service-worker private boundary");
}
requireContains(serviceWorkerSource, 'cacheBoundary === "public"', "Service-worker public boundary");

const progress = await request("/en/progress", { accept: "text/html" });
requireContains(
  (progress.headers.get("x-robots-tag") ?? "").toLowerCase(),
  "noindex",
  "Private progress indexing policy",
);
requireContains(
  (progress.headers.get("cache-control") ?? "").toLowerCase(),
  "no-store",
  "Private progress cache policy",
);
if (progress.headers.get("x-skillup-cacheable")) {
  throw new Error("Private progress must never declare the public service-worker cache boundary.");
}

const proxyHealth = await json("/api/v1/health");
requireEqual(proxyHealth.body.status, "ok", "Proxied API health status");
requireEqual(proxyHealth.body.service, "skillup-api", "Proxied API health service");
requireContains(
  proxyHealth.response.headers.get("cache-control") ?? "",
  "no-store",
  "API cache policy",
);

const proxyReady = await json("/api/v1/ready");
requireEqual(proxyReady.body.status, "ok", "Proxied API readiness");

const proxyVersion = await json("/api/v1/version");
requireEqual(proxyVersion.body.service, "skillup-api", "Proxied API version service");

if (directApiBase) {
  const directHealth = await json("/v1/health", { base: directApiBase });
  requireEqual(directHealth.body.status, "ok", "Direct API health status");
  requireEqual(
    directHealth.body.releaseSha,
    proxyHealth.body.releaseSha,
    "Direct/proxied API release SHA",
  );
}

const webRelease = webHealth.body.releaseSha;
const apiRelease = proxyHealth.body.releaseSha;
if (expectedRelease) {
  requireEqual(webRelease, expectedRelease, "Web release SHA");
  requireEqual(apiRelease, expectedRelease, "API release SHA");
} else if (webRelease !== "local" && apiRelease !== "local") {
  requireEqual(webRelease, apiRelease, "Web/API release SHA");
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      webUrl: webBase.origin,
      apiCheckedDirectly: directApiBase !== null,
      webRelease,
      apiRelease,
      checks: [
        "web health",
        "server-rendered homepage",
        "public skill catalog and detail HTML",
        "visible-content-matched structured data",
        "installable PWA manifest and service worker",
        "explicit public cache boundary",
        "private progress noindex/no-store",
        "API liveness through same-origin proxy",
        "database-backed readiness",
        "release identity",
      ],
    },
    null,
    2,
  ),
);
