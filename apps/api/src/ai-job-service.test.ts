import { describe, expect, it } from "vitest";

import { createAiJobService } from "./ai-job-service.js";

type QueryCall = Readonly<{
  text: string;
  values: readonly unknown[];
}>;

const requestId = "11111111-1111-4111-8111-111111111111";
const leaseToken = "22222222-2222-4222-8222-222222222222";

function failurePool(attemptCount: number): Readonly<{
  pool: Parameters<typeof createAiJobService>[0]["pool"];
  calls: QueryCall[];
}> {
  const calls: QueryCall[] = [];
  const database = {
    query: async (text: string, values: readonly unknown[] = []) => {
      calls.push({ text, values });
      if (text.includes("from ai_generation_requests") && text.includes("for update")) {
        return {
          rows: [
            {
              id: requestId,
              task: "generate_level",
              locale: "en",
              status: "running",
              lease_token: leaseToken,
              attempt_count: attemptCount,
              prompt_version: "v1",
              correlation_id: "ai-job-failure-regression",
            },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };

  return {
    pool: {
      connect: async () => database,
    } as unknown as Parameters<typeof createAiJobService>[0]["pool"],
    calls,
  };
}

function failureUpdate(calls: readonly QueryCall[]): QueryCall {
  const call = calls.find(
    ({ text }) => text.includes("update ai_generation_requests") && text.includes("next_attempt_at"),
  );
  if (!call) throw new Error("AI failure state update was not executed.");
  return call;
}

describe("AI job failure lifecycle", () => {
  it("queues retryable failures with an explicitly typed null completion timestamp", async () => {
    const failedAt = new Date("2026-08-31T10:00:00.000Z");
    const { pool, calls } = failurePool(1);
    const service = createAiJobService({ pool, now: () => failedAt });

    await expect(
      service.fail(requestId, {
        leaseToken,
        provider: "deepseek",
        model: "deepseek-chat",
        errorCode: "provider_timeout",
        errorMessage: "Provider request timed out.",
        retryable: true,
        maxAttempts: 3,
      }),
    ).resolves.toEqual({ failed: true, terminal: false });

    const update = failureUpdate(calls);
    expect(update.text).toContain("completed_at = $4::timestamptz");
    expect(update.text).not.toContain("case when $2 = 'failed'");
    expect(update.values[1]).toBe("queued");
    expect(update.values[3]).toBeNull();
  });

  it("records a completion timestamp only when the failure is terminal", async () => {
    const failedAt = new Date("2026-08-31T10:05:00.000Z");
    const { pool, calls } = failurePool(3);
    const service = createAiJobService({ pool, now: () => failedAt });

    await expect(
      service.fail(requestId, {
        leaseToken,
        provider: "deepseek",
        model: "deepseek-chat",
        errorCode: "provider_error",
        errorMessage: "Provider rejected the request.",
        retryable: true,
        maxAttempts: 3,
      }),
    ).resolves.toEqual({ failed: true, terminal: true });

    const update = failureUpdate(calls);
    expect(update.values[1]).toBe("failed");
    expect(update.values[3]).toBe(failedAt);
  });
});
