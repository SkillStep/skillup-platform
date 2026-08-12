import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
}

test("content editor resolves generation/edit authority only", async ({ request }) => {
  const session = await request.get("/api/v1/admin/session");
  requireOk(session, "Content editor session");
  const body = await session.json();

  expect(body.admin.roles).toContain("content_editor");
  expect(body.admin.capabilities).toContain("ai.request");
  expect(body.admin.capabilities).toContain("content.edit");
  expect(body.admin.capabilities).not.toContain("ai.review");
  expect(body.admin.capabilities).not.toContain("ai.publish");
  expect(body.admin.capabilities).not.toContain("payment.reconcile");
});

test("content editor passes authorization before generation validation but cannot review or publish", async ({ request }) => {
  const invalidGeneration = await request.post("/api/v1/admin/ai/requests", {
    data: {
      task: "summarize_content",
      targetType: "staging_qa",
      locale: "en",
      promptVersion: "summarize.v1",
      requestedItems: 0,
      inputPayload: { source_material: "Authorization certification" },
    },
  });
  expect(invalidGeneration.status()).toBe(400);

  const review = await request.post(`/api/v1/admin/ai/artifacts/${randomUUID()}/reviews`, {
    data: { decision: "reject", reason: "Authorization certification" },
  });
  expect(review.status()).toBe(403);

  const publish = await request.post(`/api/v1/admin/ai/artifacts/${randomUUID()}/publish`, {
    data: {
      targetType: "staging_qa",
      targetVersionId: randomUUID(),
      reason: "Authorization certification",
    },
  });
  expect(publish.status()).toBe(403);
});
