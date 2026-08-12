import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
}

test("security admin resolves security and Premium-governance authority without payment reconciliation", async ({ request }) => {
  const session = await request.get("/api/v1/admin/session");
  requireOk(session, "Security Admin session");
  const body = await session.json();
  expect(body.admin.roles).toContain("security_admin");
  expect(body.admin.capabilities).toContain("audit.read");
  expect(body.admin.capabilities).not.toContain("payment.reconcile");
  expect(body.admin.capabilities).not.toContain("ai.publish");

  const access = await request.get("/api/v1/admin/reports/premium/access");
  requireOk(access, "Security Admin Premium access");
  const premium = (await access.json()).premium;
  expect(premium.canReadReports).toBe(true);
  expect(premium.canExportReports).toBe(true);
  expect(premium.canAdjustSubscriptions).toBe(true);
  expect(premium.canManagePlans).toBe(true);
  expect(premium.canReconcilePayments).toBe(false);
});

test("security admin cannot cross into payment reconciliation or AI publication", async ({ request }) => {
  const reconciliation = await request.post(`/api/v1/admin/reconciliation/${randomUUID()}/resolve`, {
    data: { disposition: "ignored", resolution: "Security role isolation certification" },
  });
  expect(reconciliation.status()).toBe(403);

  const publication = await request.post(`/api/v1/admin/ai/artifacts/${randomUUID()}/publish`, {
    data: {
      targetType: "staging_qa",
      targetVersionId: randomUUID(),
      reason: "Security role isolation certification",
    },
  });
  expect(publication.status()).toBe(403);
});
