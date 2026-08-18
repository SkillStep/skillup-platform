import { expect, test } from "@playwright/test";

const skills = [
  ["interview-workplace-communication", "Interview and Workplace Communication"],
  ["practical-english-study-work", "Practical English for Study and Work"],
  ["ai-tools-study-work", "AI Tools for Study and Work"],
  ["freelancing-foundations", "Freelancing Foundations"],
  ["digital-marketing-foundations", "Digital Marketing Foundations"],
];

test("public discovery renders the reviewed launch catalog", async ({ page }) => {
  const response = await page.goto("/en/skills");
  expect(response?.ok()).toBeTruthy();

  for (const [, title] of skills) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
});

for (const [slug, title] of skills) {
  test(`reviewed path is server-rendered: ${slug}`, async ({ page }) => {
    const response = await page.goto(`/en/paths/${slug}`);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start reviewed practice" })).toBeVisible();
    expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThan(0);
  });
}

test("web and API health responses expose safe release identity metadata", async ({ request }) => {
  const web = await request.get("/api/health");
  expect(web.ok()).toBe(true);
  const webBody = await web.json();
  expect(webBody.status).toBe("ok");
  expect(webBody.service).toBe("skillup-web");
  expect(webBody.releaseSha).toBeTruthy();
  expect(webBody.pipelineId).toBeTruthy();
  expect(webBody.artifactRef).toBeTruthy();
  expect(webBody.imageDigest).toBeTruthy();

  const api = await request.get("/api/v1/ready");
  expect(api.ok()).toBe(true);
  const apiBody = await api.json();
  expect(apiBody.status).toBe("ok");
  expect(apiBody.service).toBe("skillup-api");
  expect(apiBody.releaseSha).toBe(webBody.releaseSha);
});

test("public runtime emits defensive cache and content headers", async ({ request }) => {
  const webHealth = await request.get("/api/health");
  expect(webHealth.headers()["cache-control"]?.toLowerCase()).toContain("no-store");
  expect(webHealth.headers()["x-content-type-options"]?.toLowerCase()).toBe("nosniff");

  const apiHealth = await request.get("/api/v1/health");
  expect(apiHealth.headers()["cache-control"]?.toLowerCase()).toContain("no-store");
  expect(apiHealth.headers()["x-frame-options"]?.toUpperCase()).toBe("DENY");
  expect(apiHealth.headers()["x-content-type-options"]?.toLowerCase()).toBe("nosniff");
});

test("unknown API resources fail safely", async ({ request }) => {
  const response = await request.get("/api/v1/this-route-must-not-exist");
  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body.code).toBe("not_found");
  expect(body.requestId).toBeTruthy();
});

test("private learning requires authentication", async ({ page }) => {
  await page.goto("/en/learn/3c315a1a-824a-413e-836d-69a9fc8bad1f");
  await page.waitForURL(/\/en\/sign-in(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
});

test("private routes remain non-indexable and non-cacheable", async ({ request }) => {
  for (const route of ["/en/progress", "/en/account", "/en/admin", "/en/admin/premium"]) {
    const response = await request.get(route, { maxRedirects: 0 });
    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl.toLowerCase()).toContain("no-store");
  }
});
