import { expect, test } from "@playwright/test";

test("real authenticated learner sees only their private certificate inventory and 10 skill states", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/v1/me/certificates");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]?.toLowerCase()).toContain("no-store");
  expect(response.headers()["x-robots-tag"]?.toLowerCase()).toContain("noindex");
  const body = await response.json();
  expect(Array.isArray(body.certificates)).toBe(true);
  // Do not print or archive PII from actual staging learner accounts.
  for (const award of body.certificates) {
    expect(award.publicId).toMatch(/^SC-[A-Za-z0-9_-]{26,64}$/);
    expect(award.title).toMatch(/^Certificate of Completion/);
  }
  const pageResponse = await page.goto("/en/certificates");
  expect(pageResponse?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1, name: "My Certificates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Completion requirements" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page.getByRole("heading", { name: "Sign in to see your certificates" })).toHaveCount(
    0,
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);

  for (const slug of [
    "interview-workplace-communication",
    "practical-english-study-work",
    "ai-tools-study-work",
    "freelancing-foundations",
    "digital-marketing-foundations",
    "prompt-engineering-generative-ai",
    "cybersecurity-digital-safety",
    "data-analytics-dashboards",
    "applied-ai-workflows",
    "sales-client-negotiation",
  ]) {
    const eligibility = await request.get(`/api/v1/me/certificate-eligibility/${slug}`);
    expect(eligibility.status(), `Eligibility for ${slug}`).toBe(200);
    expect(eligibility.headers()["cache-control"]?.toLowerCase()).toContain("no-store");
    const json = await eligibility.json();
    expect(["unavailable", "incomplete", "eligible", "earned"]).toContain(json.eligibility.status);
  }
});
