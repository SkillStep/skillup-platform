import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
}

test("publisher resolves only publication authority", async ({ request }) => {
  const session = await request.get("/api/v1/admin/session");
  requireOk(session, "Publisher session");
  const body = await session.json();

  expect(body.admin.roles).toContain("publisher");
  expect(body.admin.capabilities).toContain("ai.publish");
  expect(body.admin.capabilities).toContain("content.rollback");
  expect(body.admin.capabilities).not.toContain("payment.reconcile");
  expect(body.admin.capabilities).not.toContain("ai.request");
});

test("publisher cannot cross into payment, entitlement or generation authority", async ({
  request,
}) => {
  const reconciliation = await request.post(
    `/api/v1/admin/reconciliation/${randomUUID()}/resolve`,
    {
      data: { disposition: "ignored", resolution: "Authorization boundary certification" },
    },
  );
  expect(reconciliation.status()).toBe(403);

  const entitlement = await request.post(`/api/v1/admin/entitlements/${randomUUID()}/correct`, {
    data: { nextStatus: "revoked", reason: "Authorization boundary certification" },
  });
  expect(entitlement.status()).toBe(403);

  const generation = await request.post("/api/v1/admin/ai/requests", {
    data: {
      task: "summarize_content",
      targetType: "staging_qa",
      locale: "en",
      promptVersion: "summarize.v1",
      requestedItems: 1,
      inputPayload: { source_material: "Authorization boundary certification" },
    },
  });
  expect(generation.status()).toBe(403);
});

test("publisher has no Premium reporting or export authority", async ({ request }) => {
  const access = await request.get("/api/v1/admin/reports/premium/access");
  requireOk(access, "Publisher Premium access");
  const body = await access.json();
  expect(body.premium.canReadReports).toBe(false);
  expect(body.premium.canExportReports).toBe(false);
  expect(body.premium.canAdjustSubscriptions).toBe(false);
  expect(body.premium.canReconcilePayments).toBe(false);
});

test("course publisher cannot self-review and default release flag blocks publication", async ({ request }) => {
  const review = await request.post("/api/v1/admin/course-submissions/" + randomUUID() + "/review", {
    data: { kind: "accessibility", decision: "approve", reason: "Independent reviewer required.", checklist: {} },
  });
  expect(review.status()).toBe(403);
  const publish = await request.post("/api/v1/admin/course-submissions/" + randomUUID() + "/publish", {
    data: { reason: "Explicit non-production publisher release gate is required.", stagingEvidenceUrl: "https://example.org/staging" },
  });
  expect(publish.status()).toBe(403);
});
