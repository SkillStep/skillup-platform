import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

async function requireOk(response, label) {
  if (!response.ok()) {
    throw new Error(
      `${label} failed with HTTP ${response.status()}: ${(await response.text()).slice(0, 300)}`,
    );
  }
}

async function waitForArtifact(request, requestId, correlationId) {
  const deadline = Date.now() + 90_000;
  let lastStatus = null;
  while (Date.now() < deadline) {
    const statusResponse = await request.get(`/api/v1/admin/ai/requests/${requestId}`);
    await requireOk(statusResponse, "AI request status");
    const statusBody = await statusResponse.json();
    lastStatus = statusBody.request;
    if (["failed", "cancelled"].includes(lastStatus.status)) {
      throw new Error(
        `AI request ${requestId} became ${lastStatus.status} after ${lastStatus.attemptCount} attempt(s): ${lastStatus.lastError ?? "no diagnostic was recorded"}`,
      );
    }

    const response = await request.get("/api/v1/admin/ai/artifacts?limit=100");
    await requireOk(response, "AI artifact list");
    const body = await response.json();
    const artifact = body.artifacts.find((candidate) => candidate.correlationId === correlationId);
    if (artifact) return artifact;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `AI artifact for correlation ${correlationId} did not arrive within 90 seconds. Last request status: ${JSON.stringify(lastStatus)}`,
  );
}

test("DeepSeek request reaches human review, publication and rollback", async ({ request }) => {
  test.setTimeout(120_000);
  const qaRunId = process.env.STAGING_QA_RUN_ID ?? `local-${Date.now()}`;
  const expectedProvider = process.env.STAGING_EXPECTED_AI_PROVIDER ?? "deepseek";

  const created = await request.post("/api/v1/admin/ai/requests", {
    data: {
      task: "summarize_content",
      targetType: "staging_qa",
      targetId: `AUTO-QA-${qaRunId}`,
      locale: "en",
      promptVersion: "summarize.v1",
      requestedItems: 1,
      inputPayload: {
        source_material:
          "SkillUp is a reviewed learning platform. Automated staging certification verifies deployed behavior before human UAT.",
      },
    },
  });
  expect(created.status()).toBe(202);
  const createdBody = await created.json();
  expect(createdBody.status).toBe("queued");

  const artifact = await waitForArtifact(request, createdBody.id, createdBody.correlationId);
  expect(artifact.provider).toBe(expectedProvider);
  expect(["in_review", "held"]).toContain(artifact.status);
  expect(Number(artifact.qualityScore)).toBeGreaterThanOrEqual(Number(artifact.qualityThreshold));
  expect(artifact.validationReport.schema).toBe(true);

  const reviewed = await request.post(`/api/v1/admin/ai/artifacts/${artifact.id}/reviews`, {
    data: {
      decision: "approve",
      reason: `Automated staging certification ${qaRunId}`,
    },
  });
  await requireOk(reviewed, "AI artifact approval");
  const reviewedBody = await reviewed.json();
  expect(reviewedBody.artifact.status).toBe("approved");

  const targetVersionId = randomUUID();
  const published = await request.post(`/api/v1/admin/ai/artifacts/${artifact.id}/publish`, {
    data: {
      targetType: "staging_qa",
      targetVersionId,
      reason: `Automated staging certification ${qaRunId}`,
    },
  });
  await requireOk(published, "AI artifact publication");
  const publishedBody = await published.json();
  expect(publishedBody.publication.targetType).toBe("staging_qa");
  expect(publishedBody.publication.targetVersionId).toBe(targetVersionId);

  const rolledBack = await request.post(`/api/v1/admin/ai/artifacts/${artifact.id}/rollback`, {
    data: { reason: `Automated staging rollback ${qaRunId}` },
  });
  await requireOk(rolledBack, "AI artifact rollback");
  const rollbackBody = await rolledBack.json();
  expect(rollbackBody.publication.targetVersionId).toBe(targetVersionId);
  expect(rollbackBody.publication.rolledBackAt).toBeTruthy();
});
