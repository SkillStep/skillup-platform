import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
}

test("broad Admin can read all Premium reporting ledgers and plan history", async ({ request }) => {
  for (const route of [
    "/api/v1/admin/reports/premium/summary?preset=last_7_days&aggregation=daily",
    "/api/v1/admin/reports/premium/payments?preset=last_7_days&aggregation=daily&limit=10&offset=0",
    "/api/v1/admin/reports/premium/memberships?preset=last_7_days&aggregation=daily&limit=10&offset=0",
    "/api/v1/admin/reports/premium/recurring-customers?preset=last_30_days&aggregation=daily&limit=10&offset=0",
    "/api/v1/admin/reports/premium/reconciliation?preset=last_30_days&aggregation=daily&limit=10&offset=0",
    "/api/v1/admin/reports/premium/plans",
    "/api/v1/admin/reports/premium/exports?limit=10",
  ]) {
    const response = await request.get(route);
    requireOk(response, route);
  }
});

test("broad Admin can create and download an audited CSV export", async ({ request }) => {
  const created = await request.post("/api/v1/admin/reports/premium/exports", {
    data: {
      reportType: "summary",
      filters: { preset: "last_7_days", aggregation: "daily" },
      reason: "Automated staging certification export",
    },
  });
  expect(created.status()).toBe(201);
  const body = await created.json();
  expect(body.export.id).toBeTruthy();

  const downloaded = await request.get(
    `/api/v1/admin/reports/premium/exports/${body.export.id}/download`,
  );
  requireOk(downloaded, "Premium CSV download");
  expect(downloaded.headers()["content-type"] ?? "").toContain("text/csv");
  expect(downloaded.headers()["content-disposition"] ?? "").toContain("attachment");
  expect((await downloaded.text()).length).toBeGreaterThan(20);
});

test("invalid custom report ranges fail closed", async ({ request }) => {
  const response = await request.get(
    "/api/v1/admin/reports/premium/summary?preset=custom&aggregation=daily&from=2026-08-12T00%3A00%3A00.000Z",
  );
  expect(response.status()).toBe(400);
});

test("Premium plan and grant mutations require trusted origin and valid input", async ({
  request,
}) => {
  const untrustedPlan = await request.post("/api/v1/admin/reports/premium/plans/versions", {
    headers: { origin: "https://attacker.invalid" },
    data: {
      planCode: "premium-monthly",
      amountMinor: 59_900,
      currency: "PKR",
      billingPeriod: "month",
      capabilities: ["premium_access"],
      termsVersion: "staging-qa",
      reason: "Origin isolation certification",
    },
  });
  expect(untrustedPlan.status()).toBe(403);

  const invalidPlan = await request.post("/api/v1/admin/reports/premium/plans/versions", {
    data: {
      planCode: "premium-monthly",
      amountMinor: 0,
      currency: "PKR",
      billingPeriod: "month",
      capabilities: ["premium_access"],
      termsVersion: "staging-qa",
      reason: "Validation certification",
    },
  });
  expect(invalidPlan.status()).toBe(400);
});
