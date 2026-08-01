import { describe, expect, it, vi } from "vitest";

import { createMaintenanceRunner } from "./maintenance.js";

function logger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

describe("maintenance runner", () => {
  it("runs every task and contains individual failures", async () => {
    const log = logger();
    const runner = createMaintenanceRunner({
      intervalMs: 60_000,
      logger: log,
      now: () => new Date("2026-08-01T00:00:00.000Z"),
      tasks: [
        { name: "commercial", run: async () => ({ processed: 2 }) },
        {
          name: "content",
          run: async () => {
            throw new Error("publication failed");
          },
        },
        { name: "privacy", run: async () => 1 },
      ],
    });

    await expect(runner.runOnce()).resolves.toEqual({
      startedAt: "2026-08-01T00:00:00.000Z",
      completedAt: "2026-08-01T00:00:00.000Z",
      succeeded: ["commercial", "privacy"],
      failed: ["content"],
    });
    expect(log.info).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("reuses the active run instead of overlapping maintenance", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = vi.fn(async () => pending);
    const runner = createMaintenanceRunner({
      intervalMs: 60_000,
      logger: logger(),
      tasks: [{ name: "exclusive", run: task }],
    });

    const first = runner.runOnce();
    const second = runner.runOnce();
    expect(second).toBe(first);
    expect(task).toHaveBeenCalledTimes(1);

    release?.();
    await first;
  });

  it("rejects unsafe configuration", () => {
    expect(() =>
      createMaintenanceRunner({
        intervalMs: 999,
        logger: logger(),
        tasks: [{ name: "a", run: vi.fn() }],
      }),
    ).toThrow("at least one second");
    expect(() =>
      createMaintenanceRunner({
        intervalMs: 1_000,
        logger: logger(),
        tasks: [
          { name: "duplicate", run: vi.fn() },
          { name: "duplicate", run: vi.fn() },
        ],
      }),
    ).toThrow("unique");
  });
});
