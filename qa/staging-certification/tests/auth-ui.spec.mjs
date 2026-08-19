import { expect, test } from "@playwright/test";

import { qaIdentity, retrieveOtpForUi } from "../helpers/identity.mjs";

const api = "/api/v1";

test("passwordless sign-in delivers and verifies a real staging OTP", async ({ page }) => {
  const email = qaIdentity("STAGING_QA_LEARNER_EMAIL");
  await page.goto("/en/sign-in?returnTo=%2Fen%2Fprogress");

  await page.getByLabel("Email address").fill(email);
  const startedAfter = new Date(Date.now() - 2_000).toISOString();
  await page.getByRole("button", { name: "Send sign-in code" }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const code = await retrieveOtpForUi(email, startedAfter);
  await page.getByLabel("Four-digit code").fill(code);
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await page.waitForURL((url) => !url.pathname.endsWith("/sign-in"));
  expect(["/en/onboarding", "/en/progress"]).toContain(new URL(page.url()).pathname);
});

test("invalid sign-in email is rejected", async ({ request }) => {
  const response = await request.post(`${api}/auth/email/start`, {
    data: { email: "not-an-email" },
  });
  expect(response.status()).toBe(400);
});

test("untrusted Origin cannot start authentication", async ({ request }) => {
  const response = await request.post(`${api}/auth/email/start`, {
    headers: { origin: "https://attacker.invalid" },
    data: { email: "qa-invalid-origin@example.invalid" },
  });
  expect(response.status()).toBe(403);
});

test("malformed OTP verification payload is rejected", async ({ request }) => {
  const response = await request.post(`${api}/auth/email/verify`, {
    data: {
      challengeId: "not-a-uuid",
      code: "12345",
    },
  });
  expect(response.status()).toBe(400);
});

test("protected learner APIs reject unauthenticated access", async ({ request }) => {
  for (const route of [
    `${api}/auth/session`,
    `${api}/account/capabilities`,
    `${api}/commercial/account`,
    `${api}/account/sessions`,
    `${api}/account/privacy`,
  ]) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(401);
  }
});

test("protected Admin APIs reject unauthenticated access", async ({ request }) => {
  for (const route of [
    `${api}/admin/session`,
    `${api}/admin/metrics`,
    `${api}/admin/reports/premium/access`,
  ]) {
    const response = await request.get(route);
    expect([401, 403], `${route} should remain protected`).toContain(response.status());
  }
});

test("private browser routes redirect unauthenticated visitors to sign-in", async ({ page }) => {
  for (const route of ["/en/progress", "/en/account", "/en/admin", "/en/admin/premium"]) {
    await page.goto(route);
    await page.waitForURL(/\/en\/sign-in(?:\?|$)/);
  }
});