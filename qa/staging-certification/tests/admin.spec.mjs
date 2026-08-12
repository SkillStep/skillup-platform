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
