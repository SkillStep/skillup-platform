import { describe, expect, it } from "vitest";

import {
  applyQualifiedActivity,
  isValidTimeZone,
  leaderboardPeriodStart,
  localDateFor,
  progressCapabilities,
} from "./progress-policy.js";

describe("progress capability boundaries", () => {
  it("keeps detailed history server-authoritative", () => {
    expect(progressCapabilities("free")).toEqual({
      tier: "free",
      detailedLevelHistory: false,
      ledgerHistoryLimit: 20,
      levelHistoryLimit: 3,
      leaderboardAccess: true,
    });
    expect(progressCapabilities("premium")).toMatchObject({
      tier: "premium",
      detailedLevelHistory: true,
      ledgerHistoryLimit: 200,
      levelHistoryLimit: 100,
    });
  });
});

describe("timezone-safe streak policy", () => {
  it("resolves the learner local day from a server timestamp", () => {
    const instant = new Date("2026-07-30T20:30:00.000Z");
    expect(localDateFor(instant, "Asia/Karachi")).toBe("2026-07-31");
    expect(localDateFor(instant, "UTC")).toBe("2026-07-30");
    expect(isValidTimeZone("Asia/Karachi")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("counts only one qualification per local day", () => {
    const transition = applyQualifiedActivity(
      {
        currentDays: 4,
        longestDays: 6,
        lastQualifiedDate: "2026-07-30",
        graceCredits: 1,
      },
      "2026-07-30",
    );

    expect(transition).toMatchObject({
      currentDays: 4,
      longestDays: 6,
      lastQualifiedDate: "2026-07-30",
      graceCredits: 1,
      changed: false,
    });
  });

  it("extends consecutive days and uses one grace credit for one missed day", () => {
    const consecutive = applyQualifiedActivity(
      {
        currentDays: 2,
        longestDays: 2,
        lastQualifiedDate: "2026-07-28",
        graceCredits: 1,
      },
      "2026-07-29",
    );
    expect(consecutive).toMatchObject({ currentDays: 3, longestDays: 3, eventType: "qualified" });

    const grace = applyQualifiedActivity(
      {
        currentDays: 3,
        longestDays: 3,
        lastQualifiedDate: "2026-07-29",
        graceCredits: 1,
      },
      "2026-07-31",
    );
    expect(grace).toMatchObject({
      currentDays: 4,
      longestDays: 4,
      graceCredits: 0,
      eventType: "grace",
    });
  });

  it("starts a new streak after a larger gap without trusting a device clock", () => {
    expect(
      applyQualifiedActivity(
        {
          currentDays: 9,
          longestDays: 9,
          lastQualifiedDate: "2026-07-20",
          graceCredits: 0,
        },
        "2026-07-30",
      ),
    ).toMatchObject({ currentDays: 1, longestDays: 9, lastQualifiedDate: "2026-07-30" });
  });
});

describe("leaderboard periods", () => {
  it("uses UTC calendar boundaries rather than client-supplied dates", () => {
    const now = new Date("2026-07-30T19:00:00.000Z");
    expect(leaderboardPeriodStart("week", now)?.toISOString()).toBe("2026-07-27T00:00:00.000Z");
    expect(leaderboardPeriodStart("month", now)?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(leaderboardPeriodStart("all_time", now)).toBeNull();
  });
});
