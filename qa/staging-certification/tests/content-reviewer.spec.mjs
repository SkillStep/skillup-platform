import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

function requireOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
}

test("content reviewer resolves review authority without publication or payment authority", async ({
  request,
}) => {
  const session = await request.get("/api/v1/admin/session");
  requireOk(session, "Content reviewer session");
  const body = await session.json();

  expect(body.admin.roles).toContain("content_reviewer");
  expect(body.admin.capabilities).toContain("ai.review");
  expect(body.admin.capabilities).toContain("content.compare");
  expect(body.admin.capabilities).not.toContain("ai.publish");
  expect(body.admin.capabilities).not.toContain("payment.reconcile");
});

test("content reviewer can read review queue but cannot request or publish content", async ({
  request,
}) => {
  const artifacts = await request.get("/api/v1/admin/ai/artifacts?limit=1");
  requireOk(artifacts, "AI artifact queue");

  const review = await request.post(`/api/v1/admin/ai/artifacts/${randomUUID()}/reviews`, {
    data: { decision: "reject", reason: "Authorization certification" },
  });
  expect(review.status()).toBe(404);

  const generation = await request.post("/api/v1/admin/ai/requests", {
    data: {
      task: "summarize_content",
      targetType: "staging_qa",
      locale: "en",
      promptVersion: "summarize.v1",
      requestedItems: 1,
      inputPayload: { source_material: "Authorization certification" },
    },
  });
  expect(generation.status()).toBe(403);

  const publish = await request.post(`/api/v1/admin/ai/artifacts/${randomUUID()}/publish`, {
    data: {
      targetType: "staging_qa",
      targetVersionId: randomUUID(),
      reason: "Authorization certification",
    },
  });
  expect(publish.status()).toBe(403);
});
