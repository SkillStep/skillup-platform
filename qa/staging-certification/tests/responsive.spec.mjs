import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

test("mobile learner can navigate critical authenticated surfaces without horizontal overflow", async ({
  page,
}) => {
  for (const route of [
    "/en/progress",
    "/en/pricing",
    "/en/learn/3c315a1a-824a-413e-836d-69a9fc8bad1f",
  ]) {
    const response = await page.goto(route);
    expect(response?.ok()).toBeTruthy();
    await expectNoHorizontalOverflow(page);
  }
});

test("mobile Premium purchase controls remain visible and usable", async ({ page }) => {
  await page.goto("/en/pricing");
  await expect(page.getByText(/(?:PKR|Rs)\s*599/).first()).toBeVisible();
  await expect(page.getByText(/(?:PKR|Rs)\s*4,999/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
