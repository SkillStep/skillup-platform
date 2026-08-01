import type { DatabaseClient } from "@skillup/database";
import { describe, expect, it, vi } from "vitest";

import { createAiJobStatusService } from "./ai-job-status.js";

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

    await expect(
      service.status("11111111-1111-4111-8111-111111111111", "lease-a"),
    ).resolves.toEqual({
      active: true,
      cancelled: false,
    });
  });

  it("reports a requested cancellation while preserving the worker lease for acknowledgement", async () => {
    const service = createAiJobStatusService({
      pool: pool([
        {
          status: "running",
          lease_token: "lease-a",
          cancelled_at: new Date("2026-08-01T00:00:00.000Z"),
        },
      ]),
    });

    await expect(
      service.status("11111111-1111-4111-8111-111111111111", "lease-a"),
    ).resolves.toEqual({
      active: false,
      cancelled: true,
    });
  });

  it("atomically acknowledges a cancelled worker lease", async () => {
    const database = pool([{ id: "11111111-1111-4111-8111-111111111111" }]);
    const service = createAiJobStatusService({
      pool: database,
      now: () => new Date("2026-08-01T00:00:00.000Z"),
    });

    await expect(
      service.acknowledgeCancellation(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).resolves.toEqual({ cancelled: true });
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it("rejects missing requests, mismatched leases and stale cancellation acknowledgements", async () => {
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

    await expect(
      missing.acknowledgeCancellation(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
