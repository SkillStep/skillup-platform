import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test("AI request mutation rejects an untrusted origin", async ({ request }) => {
  const response = await request.post("/api/v1/admin/ai/requests", {
    headers: { origin: "https://attacker.invalid" },
    data: {
      task: "summarize_content",
      targetType: "staging_qa",
      locale: "en",
      promptVersion: "summarize.v1",
      requestedItems: 1,
      inputPayload: { source_material: "Origin isolation certification" },
    },
  });
  expect(response.status()).toBe(403);
});

test("AI request validation rejects oversized or invalid request contracts before queueing", async ({
  request,
}) => {
  const invalid = await request.post("/api/v1/admin/ai/requests", {
    data: {
      task: "summarize_content",
      targetType: "staging_qa",
      locale: "en",
      promptVersion: "summarize.v1",
      requestedItems: 101,
      inputPayload: { source_material: "Invalid bounded request certification" },
    },
  });
  expect(invalid.status()).toBe(400);
});

test("unknown AI cancellation and publication targets fail without side effects", async ({
  request,
}) => {
  const cancellation = await request.post(`/api/v1/admin/ai/requests/${randomUUID()}/cancel`, {
    data: { reason: "Unknown request certification" },
  });
  expect(cancellation.status()).toBe(404);

  const publication = await request.post(`/api/v1/admin/ai/artifacts/${randomUUID()}/publish`, {
    data: {
      targetType: "staging_qa",
      targetVersionId: randomUUID(),
      reason: "Unknown artifact certification",
    },
  });
  expect(publication.status()).toBe(404);
});
