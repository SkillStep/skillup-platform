import { expect, test } from "@playwright/test";

test("@visual public skills catalog", async ({ page }) => {
  await page.goto("/en/skills");
  await expect(page).toHaveScreenshot("public-skills.png", { fullPage: true });
});

test("@visual Premium pricing", async ({ page }) => {
  await page.goto("/en/pricing");
  await expect(page).toHaveScreenshot("premium-pricing.png", { fullPage: true });
});

test("@visual passwordless sign-in card", async ({ page }) => {
  await page.goto("/en/sign-in");
  await expect(page.locator("main")).toHaveScreenshot("sign-in-main.png");
});

test("@visual Admin shell header", async ({ page }) => {
  await page.goto("/en/admin");
  await expect(page.locator("main header")).toHaveScreenshot("admin-header.png");
});

test("@visual Premium Admin header", async ({ page }) => {
  await page.goto("/en/admin/premium");
  await expect(page.locator("main header")).toHaveScreenshot("premium-admin-header.png");
});
