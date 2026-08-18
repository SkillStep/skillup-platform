import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
}

test("staging Admin identity resolves server-side capabilities", async ({ request }) => {
  const response = await request.get("/api/v1/admin/session");
  requireOk(response, "Admin session");
  const body = await response.json();

  expect(body.admin.roles).toContain("security_admin");
  expect(body.admin.capabilities).toContain("audit.read");
  expect(body.admin.capabilities).toContain("payment.reconcile");
  expect(body.admin.capabilities).toContain("entitlement.correct");
});

test("Admin operations shell and Premium workspace render", async ({ page }) => {
  await page.goto("/en/admin");
  await expect(
    page.getByRole("heading", { name: "Review, reconcile and publish safely." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: /Open Premium subscriptions, finance reporting and recurring-customer operations/,
    }),
  ).toBeVisible();

  await page.goto("/en/admin/premium");
  await expect(
    page.getByRole("heading", { name: "Measure and operate paid membership from one authority." }),
  ).toBeVisible();
});

test("Admin Premium access is calculated by the API", async ({ request }) => {
  const response = await request.get("/api/v1/admin/reports/premium/access");
  requireOk(response, "Premium access");
  const body = await response.json();

  expect(body.premium.canReadReports).toBe(true);
  expect(body.premium.canReadPlans).toBe(true);
  expect(body.premium.canExportReports).toBe(true);
  expect(body.premium.canAdjustSubscriptions).toBe(true);
  expect(body.premium.canReconcilePayments).toBe(true);
});

test("Admin summary is backend-authoritative and identifies Karachi reporting", async ({
  request,
}) => {
  const response = await request.get("/api/v1/admin/reports/premium/summary?preset=last_7_days");
  requireOk(response, "Premium summary");
  const body = await response.json();

  expect(body.reportSchemaVersion).toBe("premium-report-v1");
  expect(body.timezone).toBe("Asia/Karachi");
  expect(body.metricDefinitions).toBeTruthy();
});

test("Premium ledgers and plan history are readable by the staging Admin", async ({ request }) => {
  for (const route of [
    "/api/v1/admin/reports/premium/payments?preset=last_7_days&limit=10&offset=0",
    "/api/v1/admin/reports/premium/memberships?preset=last_7_days&limit=10&offset=0",
    "/api/v1/admin/reports/premium/recurring-customers?preset=last_30_days&limit=10&offset=0",
    "/api/v1/admin/reports/premium/reconciliation?preset=last_30_days&limit=10&offset=0",
    "/api/v1/admin/reports/premium/plans",
    "/api/v1/admin/reports/premium/exports",
  ]) {
    const response = await request.get(route);
    requireOk(response, route);
    expect(await response.json()).toBeTruthy();
  }
});

test("Admin legacy metrics and reconciliation views remain available", async ({ request }) => {
  const metrics = await request.get("/api/v1/admin/metrics");
  requireOk(metrics, "Admin metrics");
  expect((await metrics.json()).metrics).toBeTruthy();

  const reconciliation = await request.get("/api/v1/admin/reconciliation?status=open&limit=10");
  requireOk(reconciliation, "Reconciliation list");
  expect(Array.isArray((await reconciliation.json()).cases)).toBe(true);
});

test("Admin mutations reject untrusted origins", async ({ request }) => {
  const response = await request.post("/api/v1/admin/reports/premium/exports", {
    headers: { origin: "https://attacker.invalid" },
    data: {
      reportType: "summary",
      filters: { preset: "last_7_days", aggregation: "daily" },
      reason: "Automated staging CSRF boundary test",
    },
  });
  expect(response.status()).toBe(403);
});
