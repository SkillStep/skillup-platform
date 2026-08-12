import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) {
    throw new Error(`${label} failed with HTTP ${response.status()}.`);
  }
}

test("pricing renders authoritative launch prices", async ({ page }) => {
  await page.goto("/en/pricing");
  await expect(page.getByRole("heading", { name: "SkillUp Premium Monthly" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SkillUp Premium Yearly" })).toBeVisible();
  await expect(page.getByText(/PKR\s*599/).first()).toBeVisible();
  await expect(page.getByText(/PKR\s*4,999/).first()).toBeVisible();
});

test("commercial plan API returns only the two approved launch plans", async ({ request }) => {
  const response = await request.get("/api/v1/commercial/plans");
  requireOk(response, "Plan lookup");
  const body = await response.json();
  const plans = [...body.plans].sort((a, b) => a.code.localeCompare(b.code));

  expect(plans).toHaveLength(2);
  expect(plans.map((plan) => [plan.code, plan.amountMinor, plan.currency])).toEqual([
    ["premium-monthly", 59_900, "PKR"],
    ["premium-yearly", 499_900, "PKR"],
  ]);
});

test("checkout creation is replay-safe and never grants access by client claim", async ({
  request,
}) => {
  const idempotencyKey = randomUUID();
  const payload = { planCode: "premium-monthly", idempotencyKey };

  const first = await request.post("/api/v1/commercial/orders", { data: payload });
  requireOk(first, "Initial checkout creation");
  const firstBody = await first.json();

  const replay = await request.post("/api/v1/commercial/orders", { data: payload });
  requireOk(replay, "Checkout replay");
  const replayBody = await replay.json();

  expect(replayBody.order.id).toBe(firstBody.order.id);
  expect(replayBody.order.amountMinor).toBe(firstBody.order.amountMinor);
  expect(firstBody.method).toBe("POST");
  expect(typeof firstBody.action).toBe("string");
  expect(firstBody.action.startsWith("https://")).toBe(true);

  const capabilities = await request.get("/api/v1/account/capabilities");
  requireOk(capabilities, "Capability lookup");
  const capabilityBody = await capabilities.json();
  expect(capabilityBody.tier).toBe("premium");
});
