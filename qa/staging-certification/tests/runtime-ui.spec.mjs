import { expect, test } from "@playwright/test";

test("web health exposes security headers and no-cache release metadata", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  const headers = response.headers();
  expect(headers["cache-control"] ?? "").toContain("no-store");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"] ?? "").toContain("default-src 'none'");
  const body = await response.json();
  expect(body.releaseSha).toBe(process.env.STAGING_EXPECTED_RELEASE_SHA);
  expect(body.pipelineId).toBe(process.env.STAGING_DEPLOYMENT_PIPELINE_ID);
});

test("PWA manifest and offline fallback are deployable", async ({ request, page }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const body = await manifest.json();
  expect(body.name).toMatch(/SkillUp/i);
  expect(body.start_url).toBeTruthy();

  const offline = await page.goto("/offline");
  expect(offline?.ok()).toBeTruthy();
  await expect(page.getByRole("main")).toBeVisible();
});

test("critical public navigation survives refresh, back and forward", async ({ page }) => {
  await page.goto("/en/skills", { waitUntil: "domcontentloaded" });
  await page.goto("/en/pricing", { waitUntil: "domcontentloaded" });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/en\/skills$/);
  await page.goForward({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/en\/pricing$/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(/(?:PKR|Rs)\s*599\s*\/\s*month/i).first()).toBeVisible();
});

test("critical public pages do not emit uncaught page errors", async ({ page, request }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  for (const route of ["/en", "/en/skills", "/en/pricing", "/en/sign-in"]) {
    const http = await request.get(route);
    expect(http.ok()).toBe(true);
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
  }

  expect(errors).toEqual([]);
});
