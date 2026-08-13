import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
}

test("learner support can read minimized learner support data for an authorized target", async ({
  request,
}) => {
  const session = await request.get("/api/v1/admin/session");
  requireOk(session, "Learner support session");
  const adminBody = await session.json();
  expect(adminBody.admin.roles).toContain("learner_support");
  expect(adminBody.admin.capabilities).toContain("learner.support.read");

  const learnerSession = await request.get("/api/v1/auth/session");
  requireOk(learnerSession, "Learner support account session");
  const learner = (await learnerSession.json()).learner;
  const support = await request.get(`/api/v1/admin/learners/${learner.id}/support`);
  requireOk(support, "Learner support lookup");
  const body = await support.json();

  expect(body).toBeTruthy();
  expect(JSON.stringify(body)).not.toContain("sessionToken");
  expect(JSON.stringify(body)).not.toContain("secretDigest");
});

test("learner support cannot access payment, Premium reporting or AI authority", async ({
  request,
}) => {
  const reconciliation = await request.get("/api/v1/admin/reconciliation?status=open&limit=1");
  expect(reconciliation.status()).toBe(403);

  const premium = await request.get("/api/v1/admin/reports/premium/summary?preset=last_7_days");
  expect(premium.status()).toBe(403);

  const generation = await request.post("/api/v1/admin/ai/requests", {
    data: {
      task: "summarize_content",
      targetType: "staging_qa",
      locale: "en",
      promptVersion: "summarize.v1",
      requestedItems: 1,
      inputPayload: { source_material: "Learner support authority isolation" },
    },
  });
  expect(generation.status()).toBe(403);
});
