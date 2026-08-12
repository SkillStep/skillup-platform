import { expect, test } from "@playwright/test";

import { qaIdentity, retrieveOtpForUi } from "../helpers/identity.mjs";

test("passwordless sign-in delivers and verifies a real staging OTP", async ({ page }) => {
  const email = qaIdentity("STAGING_QA_LEARNER_EMAIL");
  await page.goto("/en/sign-in?returnTo=%2Fen%2Fprogress");

  await page.getByLabel("Email address").fill(email);
  const startedAfter = new Date(Date.now() - 2_000).toISOString();
  await page.getByRole("button", { name: "Send sign-in code" }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const code = await retrieveOtpForUi(email, startedAfter);
  await page.getByLabel("Six-digit code").fill(code);
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await page.waitForURL((url) => !url.pathname.endsWith("/sign-in"));
  expect(["/en/onboarding", "/en/progress"]).toContain(new URL(page.url()).pathname);
});
