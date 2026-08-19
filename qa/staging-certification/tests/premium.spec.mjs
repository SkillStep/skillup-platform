import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const jazzCashSandboxReady = process.env.STAGING_JAZZCASH_SANDBOX_READY?.toLowerCase() === "true";

function requireOk(response, label) {
  if (!response.ok()) {
    throw new Error(`${label} failed with HTTP ${response.status()}.`);
  }
}

test("pricing renders authoritative launch prices", async ({ page }) => {
  await page.goto("/en/pricing");
  await expect(page.getByRole("heading", { name: "SkillUp Premium Monthly" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SkillUp Premium Yearly" })).toBeVisible();
  await expect(page.getByText(/(?:PKR|Rs)\s*599/).first()).toBeVisible();
  await expect(page.getByText(/(?:PKR|Rs)\s*4,999/).first()).toBeVisible();
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

test("commercial account is backend-authoritative", async ({ request }) => {
  const response = await request.get("/api/v1/commercial/account");
  requireOk(response, "Commercial account");
  const body = await response.json();
  expect(body).toBeTruthy();
  expect(JSON.stringify(body)).not.toContain("JAZZCASH_PASSWORD");
  expect(JSON.stringify(body)).not.toContain("JAZZCASH_INTEGRITY_SALT");
});

test("checkout creation is replay-safe and never grants access by client claim", async ({
  request,
}) => {
  test.skip(
    !jazzCashSandboxReady,
    "JazzCash sandbox is not configured; provider checkout remains explicitly blocked.",
  );
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

  const orderLookup = await request.get(`/api/v1/commercial/orders/${firstBody.order.id}`);
  requireOk(orderLookup, "Created order lookup");
  const persisted = (await orderLookup.json()).order;
  expect(persisted.id).toBe(firstBody.order.id);
  expect(persisted.amountMinor).toBe(59_900);
  expect(persisted.currency).toBe("PKR");

  const capabilities = await request.get("/api/v1/account/capabilities");
  requireOk(capabilities, "Capability lookup");
  const capabilityBody = await capabilities.json();
  expect(capabilityBody.tier).toBe("premium");
});

test("invalid plan and malformed idempotency keys are rejected", async ({ request }) => {
  const invalidPlan = await request.post("/api/v1/commercial/orders", {
    data: { planCode: "premium-lifetime", idempotencyKey: randomUUID() },
  });
  expect([400, 404]).toContain(invalidPlan.status());

  const invalidKey = await request.post("/api/v1/commercial/orders", {
    data: { planCode: "premium-monthly", idempotencyKey: "not-valid" },
  });
  expect(invalidKey.status()).toBe(400);
});

test("checkout mutation rejects an untrusted Origin", async ({ request }) => {
  const response = await request.post("/api/v1/commercial/orders", {
    headers: { origin: "https://attacker.invalid" },
    data: { planCode: "premium-monthly", idempotencyKey: randomUUID() },
  });
  expect(response.status()).toBe(403);
});

test("JazzCash callback rejects malformed or unsigned provider payloads", async ({ request }) => {
  const malformed = await request.post("/api/v1/commercial/jazzcash/callback", {
    data: "not-an-object",
  });
  expect([400, 415, 503]).toContain(malformed.status());

  const unsigned = await request.post("/api/v1/commercial/jazzcash/callback", {
    data: {
      pp_TxnRefNo: `AUTO-QA-${Date.now()}`,
      pp_ResponseCode: "000",
      pp_Amount: "59900",
      pp_TxnCurrency: "PKR",
      pp_SecureHash: "invalid-signature",
    },
  });
  expect([400, 503]).toContain(unsigned.status());
});