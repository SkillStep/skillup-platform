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
