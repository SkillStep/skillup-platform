import { expect, request as requestFactory, test } from "@playwright/test";

import { qaIdentity, retrieveOtpForUi } from "../helpers/identity.mjs";

function baseUrl() {
  const value = process.env.STAGING_WEB_URL?.trim();
  if (!value) throw new Error("STAGING_WEB_URL is required.");
  return value;
}

test("invalid mobile number is rejected without signing in", async ({ page }) => {
  await page.goto("/en/sign-in");
  await page.getByRole("textbox", { name: "Full name" }).fill("QA Negative");
  await page.getByRole("textbox", { name: "Mobile number" }).fill("not-a-phone");
  await page.getByLabel("Password", { exact: true }).fill("Abc@123");
  await page.getByLabel("Confirm password").fill("Abc@123");
  const rejected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/password/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await rejected).status()).toBe(400);
  await expect(page.getByText("Enter a valid Pakistani mobile number.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("wrong OTP is rejected and a consumed challenge cannot be replayed", async () => {
  const email = qaIdentity("STAGING_QA_AUTH_NEGATIVE_EMAIL");
  const origin = new URL(baseUrl()).origin;
  const context = await requestFactory.newContext({
    baseURL: baseUrl(),
    extraHTTPHeaders: { origin },
  });

  try {
    const startedAfter = new Date(Date.now() - 2_000).toISOString();
    const start = await context.post("/api/v1/auth/email/start", { data: { email } });
    expect(start.ok()).toBe(true);
    const challenge = await start.json();
    const actualCode = await retrieveOtpForUi(email, startedAfter);
    const wrongCode = actualCode === "0000" ? "1111" : "0000";

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
  await page.route("**/api/v1/auth/password/login", (route) => route.abort("failed"));
  await page.goto("/en/sign-in");
  await page.getByRole("textbox", { name: "Full name" }).fill("QA Network");
  await page.getByRole("textbox", { name: "Mobile number" }).fill("03001234567");
  await page.getByLabel("Password", { exact: true }).fill("Abc@123");
  await page.getByLabel("Confirm password").fill("Abc@123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("We could not sign you in. Check your connection and try again."),
  ).toBeVisible();
});
