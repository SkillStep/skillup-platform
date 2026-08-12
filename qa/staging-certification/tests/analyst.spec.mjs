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

  expect(body.access.canReadReports).toBe(true);
  expect(body.access.canExportReports).toBe(false);
  expect(body.access.canAdjustSubscriptions).toBe(false);
  expect(body.access.canManagePlans).toBe(false);
  expect(body.access.canReconcilePayments).toBe(false);
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
