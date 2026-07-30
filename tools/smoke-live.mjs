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
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
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
