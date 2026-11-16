import { expect, test } from "@playwright/test";

test("certificates are a private, non-indexable learner feature", async ({ page, request }) => {
  const listing = await request.get("/api/v1/me/certificates");
  expect(listing.status()).toBe(401);
  expect(listing.headers()["cache-control"]?.toLowerCase()).toContain("no-store");

  const details = await request.get(
    "/api/v1/me/certificate-eligibility/interview-workplace-communication",
  );
  expect(details.status()).toBe(401);

  const doc = await request.get(
    "/api/v1/me/certificates/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/pdf",
  );
  expect(doc.status()).toBe(401);

  const pageResponse = await page.goto("/en/certificates");
  expect(pageResponse?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1, name: "My Certificates" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  expect((await page.locator("meta[name='robots']").getAttribute("content")) ?? "").toContain(
    "noindex",
  );
});
