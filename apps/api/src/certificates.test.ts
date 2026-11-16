import { describe, expect, it, vi } from "vitest";

import { createCertificateService } from "./certificates.js";

const pool = {
  connect: vi.fn(() => {
    throw new Error("The disabled certificate feature must not connect to PostgreSQL.");
  }),
  query: vi.fn(async () => ({ rows: [] })),
} as never;

describe("certificate release boundary", () => {
  const service = createCertificateService({ pool, issuanceEnabled: false });
  const learner = {
    id: "e8007c13-8e30-432e-91b4-bb82ab3ae993",
    email: null,
    phone: null,
    profile: {
      displayName: "Sample Student",
      locale: "en",
      ageBand: "18_24",
      avatarKey: null,
      learningGoal: null,
      onboardingStatus: "completed",
    },
  } as const;

  it("refuses to issue even when a caller claims completion until explicitly enabled", async () => {
    await expect(service.issue(learner, "interview-workplace-communication")).rejects.toMatchObject(
      { statusCode: 403 },
    );
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("never invents a certificate for unknown active policy or disconnected database", async () => {
    const eligible = await service.eligibility(learner.id, "interview-workplace-communication");
    expect(eligible.status).toBe("unavailable");
    expect(eligible.requiredLevels).toBe(0);
    expect(await service.list(learner.id)).toEqual([]);
  });

  it("rejects invalid course slugs before access", async () => {
    await expect(service.eligibility(learner.id, "../../admin")).rejects.toBeTruthy();
  });
});
