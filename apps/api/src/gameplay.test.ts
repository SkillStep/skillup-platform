import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi } from "./app.js";
import type { AuthService } from "./auth.js";
import type { ApiConfig } from "./config.js";
import type { GameplayService, GameplaySessionView } from "./gameplay.js";

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

const levelId = "22222222-2222-4222-8222-222222222222";
const levelVersionId = "33333333-3333-4333-8333-333333333333";
const gameplaySessionId = "44444444-4444-4444-8444-444444444444";
const challengeId = "55555555-5555-4555-8555-555555555555";
const challengeVersionId = "66666666-6666-4666-8666-666666666666";
const idempotencyKey = "77777777-7777-4777-8777-777777777777";

const sessionView: GameplaySessionView = {
  id: gameplaySessionId,
  levelId,
  levelVersionId,
  state: "active",
  currentChallengeOrdinal: 0,
  awardedPoints: 0,
  maxPoints: 20,
  attemptsUsed: 0,
  maxAttempts: 2,
  startedAt: "2026-07-30T12:00:00.000Z",
  expiresAt: "2026-07-31T12:00:00.000Z",
  currentChallenge: {
    id: challengeId,
    versionId: challengeVersionId,
    contentVersion: 1,
    locale: "en",
    slug: "choose-strongest-evidence",
    type: "multiple_choice",
    prompt: "Which response gives the strongest evidence that a work process improved?",
    instruction: "Choose one answer.",
    points: 10,
    selectionLimit: 1,
    options: [
      { key: "claim", label: "I work hard and always improve things." },
      {
        key: "evidence",
        label: "I created a template that reduced weekly preparation time.",
      },
    ],
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

function createGameplayService(): GameplayService {
  return {
    startLevel: vi.fn(async () => sessionView),
    getSession: vi.fn(async () => sessionView),
    submit: vi.fn(async () => ({
      result: {
        challengeId,
        challengeVersionId,
        status: "correct",
        awardedPoints: 10,
        maxPoints: 10,
        explanation: "Specific actions and results provide stronger evidence than broad claims.",
        retryAllowed: false,
        attemptNumber: 1,
        evaluatedAt: "2026-07-30T12:01:00.000Z",
      },
      session: {
        ...sessionView,
        currentChallengeOrdinal: 1,
        awardedPoints: 10,
        currentChallenge: null,
      },
    })),
  };
}

function createTestApi(
  authService: AuthService = createAuthService(),
  gameplayService: GameplayService = createGameplayService(),
) {
  const app = buildApi({
    config: testConfig,
    now: () => new Date("2026-07-30T12:00:00.000Z"),
    authService,
    gameplayService,
  });
  applications.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe("server-authoritative gameplay routes", () => {
  it("rejects unauthenticated level-session creation", async () => {
    const gameplayService = createGameplayService();
    const response = await createTestApi(createAuthService(), gameplayService).inject({
      method: "POST",
      url: `/v1/gameplay/levels/${levelId}/sessions`,
      headers: { origin: "https://skillup.example" },
      payload: { locale: "en" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "request_error" });
    expect(gameplayService.startLevel).not.toHaveBeenCalled();
  });

  it("starts a version-pinned session for the authenticated learner", async () => {
    const gameplayService = createGameplayService();
    const response = await createTestApi(createAuthService(), gameplayService).inject({
      method: "POST",
      url: `/v1/gameplay/levels/${levelId}/sessions`,
      headers: {
        origin: "https://skillup.example",
        cookie: "skillup_session=browser-session-token",
      },
      payload: { locale: "en", levelVersionId },
    });

    expect(response.statusCode).toBe(201);
    expect(gameplayService.startLevel).toHaveBeenCalledWith(learner.id, levelId, {
      locale: "en",
      levelVersionId,
    });
    expect(response.json()).toMatchObject({
      id: gameplaySessionId,
      levelVersionId,
      currentChallenge: { id: challengeId, versionId: challengeVersionId },
    });
  });

  it("rejects state changes from an untrusted origin", async () => {
    const gameplayService = createGameplayService();
    const response = await createTestApi(createAuthService(), gameplayService).inject({
      method: "POST",
      url: `/v1/gameplay/levels/${levelId}/sessions`,
      headers: {
        origin: "https://attacker.example",
        cookie: "skillup_session=browser-session-token",
      },
      payload: { locale: "en" },
    });

    expect(response.statusCode).toBe(403);
    expect(gameplayService.startLevel).not.toHaveBeenCalled();
  });

  it("restores the exact current challenge after refresh", async () => {
    const gameplayService = createGameplayService();
    const response = await createTestApi(createAuthService(), gameplayService).inject({
      method: "GET",
      url: `/v1/gameplay/sessions/${gameplaySessionId}`,
      headers: { cookie: "skillup_session=browser-session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(gameplayService.getSession).toHaveBeenCalledWith(learner.id, gameplaySessionId);
    expect(response.json()).toMatchObject({
      currentChallengeOrdinal: 0,
      attemptsUsed: 0,
      currentChallenge: { versionId: challengeVersionId },
    });
  });

  it("submits only the authenticated learner and exact content version", async () => {
    const gameplayService = createGameplayService();
    const response = await createTestApi(createAuthService(), gameplayService).inject({
      method: "POST",
      url: `/v1/gameplay/sessions/${gameplaySessionId}/submissions`,
      headers: {
        origin: "https://skillup.example",
        cookie: "skillup_session=browser-session-token",
      },
      payload: {
        challengeId,
        challengeVersionId,
        idempotencyKey,
        response: { type: "multiple_choice", selectedOptionKeys: ["evidence"] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(gameplayService.submit).toHaveBeenCalledWith(learner.id, {
      sessionId: gameplaySessionId,
      challengeId,
      challengeVersionId,
      idempotencyKey,
      response: { type: "multiple_choice", selectedOptionKeys: ["evidence"] },
    });
    expect(response.json()).toMatchObject({
      result: { status: "correct", awardedPoints: 10, retryAllowed: false },
    });
  });

  it("never returns protected answer or evaluator fields", async () => {
    const response = await createTestApi().inject({
      method: "GET",
      url: `/v1/gameplay/sessions/${gameplaySessionId}`,
      headers: { cookie: "skillup_session=browser-session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("privateEvaluation");
    expect(response.body).not.toContain("correctOptionKeys");
    expect(response.body).not.toContain("correctOrder");
    expect(response.body).not.toContain("rubric");
  });
});
