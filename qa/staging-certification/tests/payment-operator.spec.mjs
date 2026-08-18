import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
}

test("payment operator resolves payment and Premium operations authority", async ({ request }) => {
  const session = await request.get("/api/v1/admin/session");
  requireOk(session, "Payment operator session");
  const body = await session.json();

  expect(body.admin.roles).toContain("payment_operator");
  expect(body.admin.capabilities).toContain("payment.read");
  expect(body.admin.capabilities).toContain("payment.reconcile");
  expect(body.admin.capabilities).toContain("entitlement.correct");

  const access = await request.get("/api/v1/admin/reports/premium/access");
  requireOk(access, "Payment operator Premium access");
  const premium = (await access.json()).premium;
  expect(premium.canReadReports).toBe(true);
  expect(premium.canExportReports).toBe(true);
  expect(premium.canAdjustSubscriptions).toBe(true);
  expect(premium.canReconcilePayments).toBe(true);
});

test("payment operator can read reconciliation and Premium ledgers", async ({ request }) => {
  for (const route of [
    "/api/v1/admin/reconciliation?status=open&limit=1",
    "/api/v1/admin/reports/premium/payments?preset=last_7_days&aggregation=daily&limit=5&offset=0",
    "/api/v1/admin/reports/premium/reconciliation?preset=last_7_days&aggregation=daily&limit=5&offset=0",
  ]) {
    const response = await request.get(route);
    requireOk(response, route);
  }
});

test("payment operator cannot request, review or publish AI content", async ({ request }) => {
  const generation = await request.post("/api/v1/admin/ai/requests", {
    data: {
      task: "summarize_content",
      targetType: "staging_qa",
      locale: "en",
      promptVersion: "summarize.v1",
      requestedItems: 1,
      inputPayload: { source_material: "Payment authority isolation" },
    },
  });
  expect(generation.status()).toBe(403);

  const review = await request.post(`/api/v1/admin/ai/artifacts/${randomUUID()}/reviews`, {
    data: { decision: "reject", reason: "Authorization boundary certification" },
  });
  expect(review.status()).toBe(403);

  const publish = await request.post(`/api/v1/admin/ai/artifacts/${randomUUID()}/publish`, {
    data: {
      targetType: "staging_qa",
      targetVersionId: randomUUID(),
      reason: "Authorization boundary certification",
    },
  });
  expect(publish.status()).toBe(403);
});
