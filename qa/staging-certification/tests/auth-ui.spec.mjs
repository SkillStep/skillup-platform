import { expect, test } from "@playwright/test";

import { qaIdentity } from "../helpers/identity.mjs";

const api = "/api/v1";

test("mobile password sign-in authenticates a staging QA learner", async ({ page }) => {
  const phone = qaIdentity("STAGING_QA_PHONE");
  await page.goto("/en/sign-in?returnTo=%2Fen%2Fprogress");
  await page.getByRole("textbox", { name: "Full name" }).fill("Staging QA Learner");
  await page.getByRole("textbox", { name: "Mobile number" }).fill(phone);
  await page.getByLabel("Password", { exact: true }).fill("Abc@123");
  await page.getByLabel("Confirm password").fill("Abc@123");
  await page.getByRole("button", { name: "Sign in" }).click();

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
  const response = await request.post(`${api}/auth/password/login`, {
    headers: { origin: "https://attacker.invalid" },
    data: {
      displayName: "Attacker",
      phone: "03001234567",
      password: "Abc@123",
    },
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

test("private browser routes redirect unauthenticated visitors to the correct sign-in", async ({
  page,
}) => {
  for (const route of ["/en/progress", "/en/account"]) {
    await page.goto(route);
    await page.waitForURL(/\/en\/sign-in(?:\?|$)/);
  }

  for (const route of ["/en/admin", "/en/admin/premium"]) {
    await page.goto(route);
    await page.waitForURL(/\/en\/admin\/sign-in(?:\?|$)/);
  }
});

test("dedicated Admin sign-in renders protected operator credentials form", async ({ page }) => {
  await page.goto("/en/admin/sign-in");
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});
