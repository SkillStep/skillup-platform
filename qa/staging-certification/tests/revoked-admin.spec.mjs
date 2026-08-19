import { expect, test } from "@playwright/test";

test("revoked Admin identity is denied server-side even with a valid learner session", async ({
  request,
  page,
}) => {
  const session = await request.get("/api/v1/auth/session");
  expect(session.ok()).toBe(true);

  const admin = await request.get("/api/v1/admin/session");
  expect(admin.status()).toBe(403);

  await page.goto("/en/admin");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your account does not have administrative access." }),
  ).toContainText("Your account does not have administrative access.");
  await expect(page.getByText(/^Roles:/)).toHaveCount(0);
});

test("revoked Admin identity cannot use direct Premium or privileged mutation APIs", async ({
  request,
}) => {
  const premium = await request.get("/api/v1/admin/reports/premium/summary?preset=last_7_days");
  expect(premium.status()).toBe(403);

  const generation = await request.post("/api/v1/admin/ai/requests", {
    data: {
      task: "summarize_content",
      targetType: "staging_qa",
      locale: "en",
      promptVersion: "summarize.v1",
      requestedItems: 1,
      inputPayload: { source_material: "Revoked authority certification" },
    },
  });
  expect(generation.status()).toBe(403);
});
