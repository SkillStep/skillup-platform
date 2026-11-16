import { expect, test } from "@playwright/test";

const awards = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    publicId: "SC-abcdefghijklmnopqrstuvwx01234567",
    title: "Certificate of Completion — Interview and Workplace Communication",
    completedAt: "2026-10-20T12:00:00.000Z",
    issuedAt: "2026-10-21T12:00:00.000Z",
    status: "issued",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    publicId: "SC-abcdefghijklmnopqrstuvwx01234568",
    title:
      "Certificate of Completion — Comprehensive AI Automation & No-Code Tools for Community Entrepreneurship and Market Research",
    completedAt: "2026-10-20T12:00:00.000Z",
    issuedAt: "2026-10-21T12:00:00.000Z",
    status: "issued",
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    publicId: "SC-abcdefghijklmnopqrstuvwx01234569",
    title: "Certificate of Completion — Digital Marketing Foundations",
    completedAt: "2026-10-20T12:00:00.000Z",
    issuedAt: "2026-10-21T12:00:00.000Z",
    status: "revoked",
  },
];

async function mockCertificateReads(page) {
  await page.route("**/api/v1/me/certificates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store" },
      body: JSON.stringify({ certificates: awards }),
    }),
  );
  await page.route("**/api/v1/me/certificate-eligibility/*", (route) => {
    const slug = new URL(route.request().url()).pathname.split("/").pop();
    const status =
      slug === "interview-workplace-communication"
        ? "earned"
        : slug === "digital-marketing-foundations"
          ? "incomplete"
          : slug === "practical-english-study-work"
            ? "eligible"
            : "unavailable";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store" },
      body: JSON.stringify({
        eligibility: {
          status,
          requiredLevels: 24,
          completedLevels: status === "incomplete" ? 10 : 24,
          requiredChallenges: 72,
          passedChallenges: status === "incomplete" ? 30 : 72,
          capstoneRequired: true,
          capstonePassed: status !== "incomplete",
        },
      }),
    });
  });
}

async function noHorizontalOverflow(page) {
  const result = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    visualViewportWidth: window.visualViewport?.width ?? window.innerWidth,
  }));
  expect(result.pageWidth, JSON.stringify(result)).toBeLessThanOrEqual(result.viewport + 2);
}

test("certificate privacy and sign-in are usable at this actual browser viewport", async ({
  page,
}) => {
  await page.route("**/api/v1/me/certificates", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    }),
  );
  const response = await page.goto("/en/certificates");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1, name: "My Certificates" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in to see your certificates" }),
  ).toBeVisible();
  const signIn = page.getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toBeVisible();
  expect(await signIn.getAttribute("href")).toContain("/en/sign-in");
  expect(await page.locator("meta[name='robots']").getAttribute("content")).toContain("noindex");
  await noHorizontalOverflow(page);
});

test("issued, long-title, revoked and 10 requirement cards remain accessible with mock data", async ({
  page,
}, testInfo) => {
  await mockCertificateReads(page);
  const response = await page.goto("/en/certificates");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Completion requirements" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Issued certificates" })).toBeVisible();
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(10);
  await expect(page.getByText("Eligible for certificate")).toBeVisible();
  await expect(page.getByText("Requirements not yet approved").first()).toBeVisible();

  const download = page.getByRole("link", { name: "Download A4 PDF" });
  await expect(download).toHaveCount(2);
  await expect(download.first()).toHaveAttribute(
    "href",
    "/api/v1/me/certificates/00000000-0000-4000-8000-000000000101/pdf",
  );
  await expect(page.getByText("Unavailable due to revocation")).toBeVisible();
  await expect(
    page.getByText("Certificate of Completion — Comprehensive AI Automation", { exact: false }),
  ).toBeVisible();

  const refresh = page.getByRole("button", { name: "Refresh" });
  await refresh.focus();
  await expect(refresh).toBeFocused();
  await expect(page.getByRole("button", { name: "Claim certificate" })).toBeEnabled();
  await noHorizontalOverflow(page);

  // Fixed fake data only, safe for CI artifacts, not real learner/award data.
  await page.screenshot({ path: testInfo.outputPath("certificate-layout.png"), fullPage: true });
});

test("320px narrow mobile width has no forced sideways scrolling or inaccessible certificate actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mockCertificateReads(page);
  await page.goto("/en/certificates");
  await expect(page.getByRole("article")).toHaveCount(10);
  await noHorizontalOverflow(page);
  const box = await page.getByRole("link", { name: "Download A4 PDF" }).first().boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(322);
});
