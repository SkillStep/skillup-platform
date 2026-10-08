import { expect, test } from "@playwright/test";

for (const route of ["/en", "/en/skills", "/en/pricing", "/en/sign-in"]) {
  test(`public accessibility smoke: ${route}`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);

    const unnamedButtons = await page.locator("button:visible").evaluateAll(
      (buttons) =>
        buttons.filter((button) => {
          const label = button.getAttribute("aria-label")?.trim();
          const text = button.textContent?.trim();
          return !label && !text;
        }).length,
    );
    expect(unnamedButtons).toBe(0);
  });
}

test("passwordless sign-in is operable with keyboard focus and labelled controls", async ({
  page,
}) => {
  await page.goto("/en/sign-in");
  const identity = page.getByRole("textbox", { name: "Email or mobile number" });
  await expect(identity).toBeVisible();
  await identity.focus();
  await expect(identity).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
});
