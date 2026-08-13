import { expect, test } from "@playwright/test";

test("critical learner page preserves one main landmark and visible focusable action", async ({
  page,
}) => {
  await page.goto("/en/learn/3c315a1a-824a-413e-836d-69a9fc8bad1f");
  await expect(page.locator("main")).toHaveCount(1);
  const action = page.getByRole("button", { name: "Check answer" });
  await expect(action).toBeVisible();
  await action.focus();
  await expect(action).toBeFocused();
});

test("private learner account controls expose semantic section headings", async ({ page }) => {
  await page.goto("/en/account");
  for (const name of [
    "Privacy and sharing",
    "Active devices and sessions",
    "Policies and disclosures",
    "Download your data",
    "Delete your account",
  ]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
});
