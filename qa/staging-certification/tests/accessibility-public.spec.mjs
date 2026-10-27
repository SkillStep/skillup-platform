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

test("password sign-in is operable with keyboard focus and labelled controls", async ({ page }) => {
  await page.goto("/en/sign-in");
  await page.getByRole("textbox", { name: "Full name" }).fill("QA Focus");
  const phone = page.getByRole("textbox", { name: "Mobile number" });
  await expect(phone).toBeVisible();
  await phone.fill("03001234567");
  await phone.focus();
  await expect(phone).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
});
