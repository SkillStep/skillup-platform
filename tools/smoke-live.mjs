const webUrlInput = process.env.SKILLUP_WEB_URL;
const apiUrlInput = process.env.SKILLUP_API_URL;
const expectedRelease = process.env.SKILLUP_EXPECTED_RELEASE_SHA;
const timeoutMilliseconds = Number(process.env.SKILLUP_SMOKE_TIMEOUT_MS ?? 15_000);
const responseBudgetMilliseconds = Number(process.env.SKILLUP_SMOKE_RESPONSE_BUDGET_MS ?? 5_000);

if (!webUrlInput) {
  throw new Error("SKILLUP_WEB_URL is required, for example https://staging.skillup.example.");
}
for (const [label, value, minimum, maximum] of [
  ["SKILLUP_SMOKE_TIMEOUT_MS", timeoutMilliseconds, 1_000, 60_000],
  ["SKILLUP_SMOKE_RESPONSE_BUDGET_MS", responseBudgetMilliseconds, 250, 30_000],
]) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
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
const timings = [];

function endpoint(base, path) {
  return new URL(path, `${base.toString().replace(/\/$/, "")}/`);
}

async function request(path, options = {}) {
  const url = endpoint(options.base ?? webBase, path);
  const startedAt = performance.now();
  const headers = new Headers({
    accept: options.accept ?? "application/json, text/html;q=0.9",
    "user-agent": "SkillUp-Deployment-Smoke/2.0",
  });
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);

  let body;
  if (options.payload !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.payload);
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    body,
    cache: "no-store",
    redirect: options.redirect ?? "follow",
    headers,
    signal: AbortSignal.timeout(timeoutMilliseconds),
  });
  const durationMilliseconds = Math.round(performance.now() - startedAt);
  timings.push({ path, durationMilliseconds, status: response.status });

  if (durationMilliseconds > responseBudgetMilliseconds) {
    throw new Error(
      `${url} exceeded the ${responseBudgetMilliseconds}ms response budget: ${durationMilliseconds}ms.`,
    );
  }

  if (response.status !== (options.status ?? 200)) {
    const responseBody = (await response.text()).slice(0, 300);
    throw new Error(
      `${url} returned ${response.status}; expected ${options.status ?? 200}. Body: ${responseBody}`,
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
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${String(actual)}.`);
  }
}

function requireContains(actual, expected, label) {
  if (!actual.includes(expected)) throw new Error(`${label} must contain ${expected}.`);
}

function requireHeader(response, name, expected, label) {
  const value = response.headers.get(name) ?? "";
  requireContains(value.toLowerCase(), expected.toLowerCase(), `${label} ${name}`);
}

function requireReferrerPolicy(response, label) {
  const value = (response.headers.get("Referrer-Policy") ?? "").toLowerCase();
  if (value !== "no-referrer" && value !== "strict-origin-when-cross-origin") {
    throw new Error(`${label} Referrer-Policy is not an approved production policy: ${value}`);
  }
}

function requireSecurityHeaders(response, label) {
  requireHeader(response, "Content-Security-Policy", "default-src", label);
  requireHeader(response, "Cross-Origin-Opener-Policy", "same-origin", label);
  requireHeader(response, "Cross-Origin-Resource-Policy", "same-origin", label);
  requireHeader(response, "Permissions-Policy", "camera=()", label);
  requireReferrerPolicy(response, label);
  requireHeader(response, "Strict-Transport-Security", "max-age=31536000", label);
  requireHeader(response, "X-Content-Type-Options", "nosniff", label);
  requireHeader(response, "X-Frame-Options", "deny", label);
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
requireSecurityHeaders(webHealth.response, "Web health");

const homepage = await request("/en", { accept: "text/html" });
const homepageHtml = await homepage.text();
requireContains(homepageHtml, "Learn useful skills in short, focused games.", "Homepage HTML");
requireContains(homepageHtml, "Practical learning for Pakistan", "Homepage positioning");
requireContains(homepageHtml, "Skip to main content", "Homepage keyboard navigation");
requireContains(homepageHtml, 'id="main-content"', "Homepage main landmark target");
requireContains(homepageHtml, '<html lang="en"', "Homepage document language");
if (Buffer.byteLength(homepageHtml, "utf8") > 500_000) {
  throw new Error("Homepage HTML exceeds the reviewed 500KB transfer boundary.");
}
requirePublicCacheBoundary(homepage, "Homepage");
requireSecurityHeaders(homepage, "Homepage");

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
requireContains(
  pilotSkillHtml,
  "Answer common interview questions with evidence.",
  "Pilot skill outcomes",
);
requireContains(pilotSkillHtml, "LearningResource", "Pilot skill structured data");
requirePublicCacheBoundary(pilotSkill, "Pilot skill");

const pilotPath = await request("/en/paths/interview-workplace-communication", {
  accept: "text/html",
});
const pilotPathHtml = await pilotPath.text();
requireContains(pilotPathHtml, "Interview Evidence", "Pilot path modules");
requireContains(pilotPathHtml, '"@type":"Course"', "Pilot path course data");
requirePublicCacheBoundary(pilotPath, "Pilot path");

const robots = await request("/robots.txt", { accept: "text/plain" });
const robotsText = await robots.text();
requireContains(robotsText, "Sitemap:", "robots.txt");
requireContains(robotsText, "/en/learn", "robots.txt private learning boundary");

const sitemap = await request("/sitemap.xml", { accept: "application/xml" });
const sitemapText = await sitemap.text();
requireContains(sitemapText, "/en/skills/interview-workplace-communication", "sitemap.xml");
if (sitemapText.includes("/en/learn/") || sitemapText.includes("/en/progress")) {
  throw new Error("sitemap.xml must not expose private learner routes.");
}

const manifest = await json("/manifest.webmanifest");
requireEqual(manifest.body.display, "standalone", "PWA display mode");
requireEqual(manifest.body.start_url, "/en", "PWA start URL");
if (!Array.isArray(manifest.body.icons) || manifest.body.icons.length < 2) {
  throw new Error("PWA manifest must expose standard and maskable icons.");
}
await request("/icons/skillup-icon.svg", { accept: "image/svg+xml" });
await request("/icons/skillup-maskable.svg", { accept: "image/svg+xml" });

const serviceWorker = await request("/sw.js", { accept: "application/javascript" });
const serviceWorkerSource = await serviceWorker.text();
for (const privatePrefix of ["/api", "/en/sign-in", "/en/progress", "/en/learn"]) {
  requireContains(serviceWorkerSource, `"${privatePrefix}"`, "Service-worker private boundary");
}
requireContains(
  serviceWorkerSource,
  'cacheBoundary === "public"',
  "Service-worker public boundary",
);

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
requireSecurityHeaders(proxyHealth.response, "Proxied API health");

const proxyReady = await json("/api/v1/ready");
requireEqual(proxyReady.body.status, "ok", "Proxied API readiness");

const proxyVersion = await json("/api/v1/version");
requireEqual(proxyVersion.body.service, "skillup-api", "Proxied API version service");

const privateSession = await json("/api/v1/auth/session", { status: 401 });
requireEqual(privateSession.body.code, "request_error", "Unauthenticated private-session code");
requireContains(
  privateSession.response.headers.get("cache-control") ?? "",
  "no-store",
  "Unauthenticated private-session cache policy",
);

const untrustedMutation = await json("/api/v1/auth/email/start", {
  method: "POST",
  status: 403,
  headers: { origin: "https://attacker.invalid" },
  payload: { email: "smoke-user@example.invalid" },
});
requireEqual(untrustedMutation.body.code, "request_error", "Untrusted-origin mutation code");
if (JSON.stringify(untrustedMutation.body).includes("smoke-user@example.invalid")) {
  throw new Error("Rejected mutation must not echo submitted personal data.");
}

if (directApiBase) {
  const directHealth = await json("/v1/health", { base: directApiBase });
  requireEqual(directHealth.body.status, "ok", "Direct API health status");
  requireEqual(
    directHealth.body.releaseSha,
    proxyHealth.body.releaseSha,
    "Direct/proxied API release SHA",
  );
  requireSecurityHeaders(directHealth.response, "Direct API health");
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
      responseBudgetMilliseconds,
      maximumObservedResponseMilliseconds: Math.max(
        ...timings.map((timing) => timing.durationMilliseconds),
      ),
      timings,
      checks: [
        "web health and security headers",
        "server-rendered homepage and keyboard boundary",
        "public skill catalog and detail HTML",
        "visible-content-matched structured data",
        "robots and sitemap privacy boundaries",
        "installable PWA manifest, icons and service worker",
        "explicit public cache boundary",
        "private progress noindex/no-store",
        "API liveness through same-origin proxy",
        "database-backed readiness",
        "unauthenticated and untrusted-origin rejection",
        "bounded response latency and homepage HTML",
        "release identity",
      ],
    },
    null,
    2,
  ),
);
