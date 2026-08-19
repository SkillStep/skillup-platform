import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
}

test("free learner remains server-authoritatively limited", async ({ request }) => {
  const response = await request.get("/api/v1/account/capabilities");
  requireOk(response, "Free learner capabilities");
  const body = await response.json();

  expect(body.tier).toBe("free");
  expect(body.unlimitedMissions).toBe(false);
  expect(Number.isInteger(body.missionsRemainingToday)).toBe(true);
  expect(body.missionsRemainingToday).toBeGreaterThanOrEqual(0);
  expect(body.missionsRemainingToday).toBeLessThanOrEqual(3);
});

test("free learner cannot reach Admin authority", async ({ request, page }) => {
  const api = await request.get("/api/v1/admin/session");
  expect(api.status()).toBe(403);

  await page.goto("/en/admin");
  await expect(page.getByText("Your account does not have administrative access.")).toBeVisible();
  await expect(page.getByText(/^Roles:/)).toHaveCount(0);
});

test("free learner can view Premium pricing without client-side tier escalation", async ({
  page,
  request,
}) => {
  await page.goto("/en/pricing");
  await expect(page.getByText(/(?:PKR|Rs)\s*599/).first()).toBeVisible();
  await expect(page.getByText(/(?:PKR|Rs)\s*4,999/).first()).toBeVisible();

  const capabilities = await request.get("/api/v1/account/capabilities");
  requireOk(capabilities, "Capability lookup after pricing view");
  expect((await capabilities.json()).tier).toBe("free");
});
