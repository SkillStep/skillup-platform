import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi } from "./app.js";
import type { AuthService } from "./auth.js";
import type { ApiConfig } from "./config.js";
import type { ProgressService } from "./progress.js";

const applications: ReturnType<typeof buildApi>[] = [];

const testConfig: ApiConfig = {
  APP_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: 3001,
  PUBLIC_APP_URL: "https://skillup.example",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  DATABASE_MAX_CONNECTIONS: 2,
  SESSION_COOKIE_NAME: "skillup_session",
  SESSION_SECRET: "test-only-session-secret-at-least-32-bytes",
  SESSION_IDLE_MINUTES: 60,
  SESSION_ABSOLUTE_HOURS: 168,
  AUTH_CHALLENGE_MINUTES: 10,
  EMAIL_PROVIDER: "disabled",
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_REQUIRE_TLS: true,
  FEATURE_PREMIUM_ENABLED: false,
  FEATURE_JAZZCASH_ENABLED: false,
  JAZZCASH_MODE: "disabled",
  JAZZCASH_VERSION: "1.1",
  JAZZCASH_TXN_TYPE: "MWALLET",
  JAZZCASH_BANK_ID: "TBANK",
  JAZZCASH_PRODUCT_ID: "RETL",
  JAZZCASH_CHECKOUT_MINUTES: 15,
  RELEASE_SHA: "test-sha",
  LOG_LEVEL: "silent",
};

const learner = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "learner@example.com",
  profile: {
    displayName: "Areeba",
    locale: "en" as const,
    ageBand: "18_24" as const,
    avatarKey: null,
    learningGoal: "Prepare for my first job interview",
    onboardingStatus: "completed" as const,
  },
};

function createAuthService(): AuthService {
  return {
    startEmailSignIn: vi.fn(async () => ({
      challengeId: "88888888-8888-4888-8888-888888888888",
      expiresAt: new Date("2026-07-30T12:10:00.000Z"),
    })),
    verifyEmailSignIn: vi.fn(async () => ({
      sessionToken: "browser-session-token",
      sessionExpiresAt: new Date("2026-08-06T12:00:00.000Z"),
      learner,
    })),
    resolveSession: vi.fn(async (token) => (token === "browser-session-token" ? learner : null)),
    revokeSession: vi.fn(async () => undefined),
    updateProfile: vi.fn(async () => learner),
  };
}

function createProgressService(): ProgressService {
  return {
    summary: vi.fn(async () => ({
      generatedAt: "2026-07-30T12:00:00.000Z",
      capabilities: {
        tier: "free" as const,
        detailedLevelHistory: false,
        ledgerHistoryLimit: 20,
        levelHistoryLimit: 3,
        leaderboardAccess: true,
      },
      pointsBalance: 20,
      streak: {
        currentDays: 1,
        longestDays: 1,
        lastQualifiedDate: "2026-07-30",
        graceCredits: 1,
        timezone: "Asia/Karachi",
      },
      badges: [
        {
          key: "first_steps",
          title: "First Steps",
          description: "Complete your first published SkillUp level.",
          unlockedAt: "2026-07-30T12:00:00.000Z",
          explanation: "Unlocked First Steps after a verified completion.",
        },
      ],
      levels: [],
      resume: null,
      leaderboard: {
        leaderboardOptIn: false,
        leaderboardAlias: "Learner-1234567890",
        leaderboardStatus: "eligible" as const,
      },
    })),
    ledger: vi.fn(async () => ({ limit: 20, entries: [] })),
    leaderboard: vi.fn(async () => ({
      period: "week" as const,
      generatedAt: "2026-07-30T12:00:00.000Z",
      entries: [{ rank: 1, alias: "Learner-1234567890", points: 20 }],
    })),
    updatePreferences: vi.fn(async (_userId, input) => ({
      timezone: input.timezone ?? "UTC",
      tier: "free" as const,
      leaderboardOptIn: input.leaderboardOptIn ?? false,
      leaderboardAlias: input.leaderboardAlias ?? "Learner-1234567890",
      leaderboardStatus: "eligible" as const,
    })),
  };
}

function createTestApi(
  authService: AuthService = createAuthService(),
  progressService: ProgressService = createProgressService(),
) {
  const app = buildApi({ config: testConfig, authService, progressService });
  applications.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe("private progress routes", () => {
  it("rejects an unauthenticated progress summary", async () => {
    const progressService = createProgressService();
    const response = await createTestApi(createAuthService(), progressService).inject({
      method: "GET",
      url: "/v1/progress/summary",
    });

    expect(response.statusCode).toBe(401);
    expect(progressService.summary).not.toHaveBeenCalled();
  });

  it("uses the authenticated learner for summary and ledger data", async () => {
    const progressService = createProgressService();
    const app = createTestApi(createAuthService(), progressService);
    const headers = { cookie: "skillup_session=browser-session-token" };

    expect(
      (await app.inject({ method: "GET", url: "/v1/progress/summary", headers })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/v1/progress/ledger", headers })).statusCode,
    ).toBe(200);
    expect(progressService.summary).toHaveBeenCalledWith(learner.id);
    expect(progressService.ledger).toHaveBeenCalledWith(learner.id);
  });

  it("returns aliases only from the opt-in leaderboard", async () => {
    const response = await createTestApi().inject({
      method: "GET",
      url: "/v1/progress/leaderboard?period=week",
      headers: { cookie: "skillup_session=browser-session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Learner-1234567890");
    expect(response.body).not.toContain(learner.email);
    expect(response.body).not.toContain(learner.profile.displayName);
    expect(response.body).not.toContain("ageBand");
  });

  it("rejects untrusted preference mutations", async () => {
    const progressService = createProgressService();
    const response = await createTestApi(createAuthService(), progressService).inject({
      method: "PATCH",
      url: "/v1/progress/preferences",
      headers: {
        origin: "https://attacker.example",
        cookie: "skillup_session=browser-session-token",
      },
      payload: { timezone: "Asia/Karachi" },
    });

    expect(response.statusCode).toBe(403);
    expect(progressService.updatePreferences).not.toHaveBeenCalled();
  });

  it("updates only the authenticated learner preferences from a trusted origin", async () => {
    const progressService = createProgressService();
    const response = await createTestApi(createAuthService(), progressService).inject({
      method: "PATCH",
      url: "/v1/progress/preferences",
      headers: {
        origin: "https://skillup.example",
        cookie: "skillup_session=browser-session-token",
      },
      payload: {
        timezone: "Asia/Karachi",
        leaderboardOptIn: true,
        leaderboardAlias: "AreebaLearns",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(progressService.updatePreferences).toHaveBeenCalledWith(learner.id, {
      timezone: "Asia/Karachi",
      leaderboardOptIn: true,
      leaderboardAlias: "AreebaLearns",
    });
  });
});
