import type { DatabaseClient } from "@skillup/database";
import { describe, expect, it, vi } from "vitest";

import { createAiJobStatusService } from "./ai-job-status";

function pool(rows: readonly Record<string, unknown>[]): DatabaseClient["pool"] {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as DatabaseClient["pool"];
}

describe("AI job status service", () => {
  it("reports an active matching lease", async () => {
    const service = createAiJobStatusService({
      pool: pool([{ status: "running", lease_token: "lease-a", cancelled_at: null }]),
    });

    await expect(service.status("11111111-1111-4111-8111-111111111111", "lease-a")).resolves.toEqual({
      active: true,
      cancelled: false,
    });
  });

  it("reports cancellation without allowing a stale worker to continue", async () => {
    const service = createAiJobStatusService({
      pool: pool([
        {
          status: "cancelled",
          lease_token: "lease-a",
          cancelled_at: new Date("2026-08-01T00:00:00.000Z"),
        },
      ]),
    });

    await expect(service.status("11111111-1111-4111-8111-111111111111", "lease-a")).resolves.toEqual({
      active: false,
      cancelled: true,
    });
  });

  it("rejects missing requests and mismatched leases", async () => {
    const missing = createAiJobStatusService({ pool: pool([]) });
    await expect(
      missing.status("11111111-1111-4111-8111-111111111111", "lease-a"),
    ).rejects.toMatchObject({ statusCode: 404 });

    const stale = createAiJobStatusService({
      pool: pool([{ status: "running", lease_token: "lease-b", cancelled_at: null }]),
    });
    await expect(
      stale.status("11111111-1111-4111-8111-111111111111", "lease-a"),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
