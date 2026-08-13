import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
}

test("analyst can read Premium reports but cannot export or manage plans", async ({ request }) => {
  const session = await request.get("/api/v1/admin/session");
  requireOk(session, "Analyst session");
  const sessionBody = await session.json();
  expect(sessionBody.admin.roles).toContain("analyst");

  const access = await request.get("/api/v1/admin/reports/premium/access");
  requireOk(access, "Analyst Premium access");
  const body = await access.json();

  expect(body.premium.canReadReports).toBe(true);
  expect(body.premium.canExportReports).toBe(false);
  expect(body.premium.canAdjustSubscriptions).toBe(false);
  expect(body.premium.canManagePlans).toBe(false);
  expect(body.premium.canReconcilePayments).toBe(false);
});

test("analyst can read reporting data", async ({ request }) => {
  for (const route of [
    "/api/v1/admin/reports/premium/summary?preset=last_7_days",
    "/api/v1/admin/reports/premium/payments?preset=last_7_days&limit=5&offset=0",
    "/api/v1/admin/reports/premium/memberships?preset=last_7_days&limit=5&offset=0",
    "/api/v1/admin/reports/premium/recurring-customers?preset=last_30_days&limit=5&offset=0",
  ]) {
    const response = await request.get(route);
    requireOk(response, route);
  }
});

test("analyst cannot create a Premium export by direct API call", async ({ request }) => {
  const response = await request.post("/api/v1/admin/reports/premium/exports", {
    data: {
      reportType: "summary",
      filters: { preset: "last_7_days", aggregation: "daily" },
      reason: "Automated QA authorization check",
    },
  });
  expect(response.status()).toBe(403);
});

test("analyst cannot manage plans, reconcile payments or correct entitlements", async ({
  request,
}) => {
  const fakeId = "00000000-0000-4000-8000-000000000001";

  const activate = await request.post(
    `/api/v1/admin/reports/premium/plans/versions/${fakeId}/activate`,
    { data: { reason: "Authorization boundary", confirmation: "CONFIRM" } },
  );
  expect(activate.status()).toBe(403);

  const reconcile = await request.post(`/api/v1/admin/reconciliation/${fakeId}/resolve`, {
    data: { disposition: "ignored", resolution: "Authorization boundary" },
  });
  expect(reconcile.status()).toBe(403);

  const entitlement = await request.post(`/api/v1/admin/entitlements/${fakeId}/correct`, {
    data: { nextStatus: "revoked", reason: "Authorization boundary" },
  });
  expect(entitlement.status()).toBe(403);
});

test("analyst cannot request, review, publish or rollback AI content", async ({ request }) => {
  const fakeId = "00000000-0000-4000-8000-000000000001";

  const requested = await request.post("/api/v1/admin/ai/requests", {
    data: {
      task: "summarize_content",
      targetType: "staging_qa",
      targetId: "analyst-denied",
      locale: "en",
      promptVersion: "summarize.v1",
      requestedItems: 1,
      inputPayload: { source_material: "Authorization test" },
    },
  });
  expect(requested.status()).toBe(403);

  const reviewed = await request.post(`/api/v1/admin/ai/artifacts/${fakeId}/reviews`, {
    data: { decision: "approve", reason: "Authorization boundary" },
  });
  expect(reviewed.status()).toBe(403);

  const published = await request.post(`/api/v1/admin/ai/artifacts/${fakeId}/publish`, {
    data: {
      targetType: "staging_qa",
      targetVersionId: fakeId,
      reason: "Authorization boundary",
    },
  });
  expect(published.status()).toBe(403);

  const rolledBack = await request.post(`/api/v1/admin/ai/artifacts/${fakeId}/rollback`, {
    data: { reason: "Authorization boundary" },
  });
  expect(rolledBack.status()).toBe(403);
});
