import { expect, request as requestFactory, test } from "@playwright/test";

import { qaIdentity, retrieveOtpForUi } from "../helpers/identity.mjs";

function baseUrl() {
  const value = process.env.STAGING_WEB_URL?.trim();
  if (!value) throw new Error("STAGING_WEB_URL is required.");
  return value;
}

test("invalid email is rejected before a sign-in request is sent", async ({ page }) => {
  await page.goto("/en/sign-in");
  const input = page.getByLabel("Email address");
  await input.fill("not-an-email");
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  expect(await input.evaluate((element) => element.validity.valid)).toBe(false);
  await expect(page.getByRole("heading", { name: "Start with your email" })).toBeVisible();
});

test("wrong OTP is rejected and a consumed challenge cannot be replayed", async () => {
  const email = qaIdentity("STAGING_QA_ONBOARDING_EMAIL");
  const origin = new URL(baseUrl()).origin;
  const context = await requestFactory.newContext({ baseURL: baseUrl(), extraHTTPHeaders: { origin } });

  try {
    const startedAfter = new Date(Date.now() - 2_000).toISOString();
    const start = await context.post("/api/v1/auth/email/start", { data: { email } });
    expect(start.ok()).toBe(true);
    const challenge = await start.json();
    const actualCode = await retrieveOtpForUi(email, startedAfter);
    const wrongCode = actualCode === "000000" ? "111111" : "000000";

    const wrong = await context.post("/api/v1/auth/email/verify", {
      data: { challengeId: challenge.challengeId, code: wrongCode },
    });
    expect(wrong.status()).toBe(400);

    const verified = await context.post("/api/v1/auth/email/verify", {
      data: { challengeId: challenge.challengeId, code: actualCode },
    });
    expect(verified.ok()).toBe(true);

    const replay = await context.post("/api/v1/auth/email/verify", {
      data: { challengeId: challenge.challengeId, code: actualCode },
    });
    expect(replay.status()).toBe(400);
  } finally {
    await context.dispose();
  }
});

test("anonymous callers cannot access learner or Admin private APIs", async () => {
  const context = await requestFactory.newContext({ baseURL: baseUrl() });
  try {
    for (const route of [
      "/api/v1/auth/session",
      "/api/v1/account/capabilities",
      "/api/v1/admin/session",
      "/api/v1/admin/reports/premium/summary?preset=last_7_days",
    ]) {
      const response = await context.get(route);
      expect(response.status()).toBe(401);
    }
  } finally {
    await context.dispose();
  }
});

test("sign-in UI reports a bounded network failure", async ({ page }) => {
  await page.route("**/api/v1/auth/email/start", (route) => route.abort("failed"));
  await page.goto("/en/sign-in");
  await page.getByLabel("Email address").fill(qaIdentity("STAGING_QA_ONBOARDING_EMAIL"));
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByText("We could not reach SkillUp. Check your connection and try again.")).toBeVisible();
});
