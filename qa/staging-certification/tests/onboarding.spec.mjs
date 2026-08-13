import { expect, test } from "@playwright/test";

async function resetOnboarding(request) {
  const response = await request.patch("/api/v1/profile", {
    data: {
      displayName: "Staging Learner",
      ageBand: "18_24",
      learningGoal: "Validate the staging onboarding journey",
      locale: "en",
      onboardingStatus: "in_progress",
    },
  });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ request }) => {
  await resetOnboarding(request);
});

test("authenticated onboarding completes and returns to the requested private route", async ({
  page,
}) => {
  await page.goto("/en/onboarding?returnTo=%2Fen%2Fprogress");
  await expect(
    page.getByRole("heading", { name: "Tell us what progress means to you." }),
  ).toBeVisible();
  await page.getByLabel("What should we call you?").fill("Staging QA Learner");
  await page.getByLabel("Age group").selectOption("25_34");
  await page
    .getByLabel("What do you want to achieve first?")
    .fill("Complete reliable SkillUp staging certification");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL(/\/en\/progress$/);
});

test("onboarding validation prevents incomplete submission", async ({ page }) => {
  await page.goto("/en/onboarding?returnTo=%2Fen%2Fprogress");
  await page.getByLabel("What should we call you?").fill("");
  await page.getByLabel("What do you want to achieve first?").fill("");
  await page.getByRole("button", { name: "Save and continue" }).click();
  expect(
    await page.getByLabel("What should we call you?").evaluate((element) => element.validity.valid),
  ).toBe(false);
  expect(
    await page
      .getByLabel("What do you want to achieve first?")
      .evaluate((element) => element.validity.valid),
  ).toBe(false);
});

test("onboarding reports a safe API/network failure without losing the form", async ({ page }) => {
  await page.route("**/api/v1/profile", (route) => {
    if (route.request().method() === "PATCH") return route.abort("failed");
    return route.continue();
  });
  await page.goto("/en/onboarding?returnTo=%2Fen%2Fprogress");
  await page.getByLabel("What should we call you?").fill("Staging QA Learner");
  await page.getByLabel("What do you want to achieve first?").fill("Validate failure recovery");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByText("We could not save your profile. Check your connection and try again."),
  ).toBeVisible();
  await expect(page.getByLabel("What should we call you?")).toHaveValue("Staging QA Learner");
});
