import { expect, test } from "@playwright/test";

test("@visual learner progress", async ({ page }) => {
  await page.goto("/en/progress");
  await expect(page.locator("main")).toHaveScreenshot("learner-progress-main.png");
});

test("@visual representative playable challenge", async ({ page }) => {
  await page.goto("/en/learn/3c315a1a-824a-413e-836d-69a9fc8bad1f");
  await expect(page.locator("main")).toHaveScreenshot("learner-challenge-main.png");
});

test("@visual learner account shell", async ({ page }) => {
  await page.goto("/en/account");
  await expect(page.locator("main")).toHaveScreenshot("learner-account-main.png");
});
