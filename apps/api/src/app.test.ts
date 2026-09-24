import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi } from "./app.js";
import type { AuthService } from "./auth.js";
import type { ApiConfig } from "./config.js";

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
  phone: null,
  profile: {
    displayName: null,
    locale: "en" as const,
    ageBand: "unspecified" as const,
    avatarKey: null,
    learningGoal: null,
    onboardingStatus: "not_started" as const,
  },
};

function createAuthService(): AuthService {
  const verified = {
    sessionToken: "test-session-token",
    sessionExpiresAt: new Date("2026-08-06T00:00:00.000Z"),
    learner,
  };
  return {
    startSignIn: vi.fn(async ({ identity }) => ({
      challengeId: "22222222-2222-4222-8222-222222222222",
      expiresAt: new Date("2026-07-30T00:10:00.000Z"),
      channel: identity.includes("@") ? ("email" as const) : ("phone" as const),
      maskedDestination: identity.includes("@") ? "l***@example.com" : "0300 *** 4567",
    })),
    verifySignIn: vi.fn(async () => verified),
    startEmailSignIn: vi.fn(async () => ({
      challengeId: "22222222-2222-4222-8222-222222222222",
      expiresAt: new Date("2026-07-30T00:10:00.000Z"),
    })),
    verifyEmailSignIn: vi.fn(async () => verified),
    listIdentities: vi.fn(async () => [
      {
        type: "email" as const,
        display: "learner@example.com",
        masked: "l***@example.com",
        verifiedAt: "2026-07-30T00:00:00.000Z",
      },
    ]),
    startIdentityLink: vi.fn(async ({ identity }) => ({
      challengeId: "33333333-3333-4333-8333-333333333333",
      expiresAt: new Date("2026-07-30T00:10:00.000Z"),
      channel: identity.includes("@") ? ("email" as const) : ("phone" as const),
      maskedDestination: identity.includes("@") ? "n***@example.com" : "0300 *** 4567",
    })),
    verifyIdentityLink: vi.fn(async () => [
      {
        type: "email" as const,
        display: "learner@example.com",
        masked: "l***@example.com",
        verifiedAt: "2026-07-30T00:00:00.000Z",
      },
      {
        type: "phone" as const,
        display: "03001234567",
        masked: "0300 *** 4567",
        verifiedAt: "2026-07-30T00:00:00.000Z",
      },
    ]),
    removeIdentity: vi.fn(async () => [
      {
        type: "email" as const,
        display: "learner@example.com",
        masked: "l***@example.com",
        verifiedAt: "2026-07-30T00:00:00.000Z",
      },
    ]),
    resolveSession: vi.fn(async (token) => (token === "test-session-token" ? learner : null)),
    revokeSession: vi.fn(async () => undefined),
    updateProfile: vi.fn(async (_userId, patch) => ({
      ...learner,
      profile: { ...learner.profile, ...patch },
    })),
  };
}

function createTestApi(
  readiness: () => Promise<boolean> = async () => true,
  authService?: AuthService,
) {
  const app = buildApi({
    config: testConfig,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    readiness,
    authService,
  });
  applications.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe("SkillUp API", () => {
  it("returns versioned, non-cacheable health metadata", async () => {
    const response = await createTestApi().inject({ method: "GET", url: "/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      status: "ok",
      service: "skillup-api",
      version: "0.0.0",
      releaseSha: "test-sha",
      timestamp: "2026-07-30T00:00:00.000Z",
    });
  });

  it("returns healthy readiness only when PostgreSQL responds", async () => {
    const ready = await createTestApi(async () => true).inject({ method: "GET", url: "/v1/ready" });
    const degraded = await createTestApi(async () => false).inject({
      method: "GET",
      url: "/v1/ready",
    });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: "ok" });
    expect(degraded.statusCode).toBe(503);
    expect(degraded.json()).toMatchObject({ status: "degraded" });
  });

  it("returns a bounded error contract without echoing the path", async () => {
    const response = await createTestApi().inject({
      method: "GET",
      url: "/v1/private-user-data",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "not_found",
      message: "The requested API resource was not found.",
    });
    expect(response.body).not.toContain("private-user-data");
  });
});

describe("unified email/mobile OTP routes", () => {
  it("starts a phone OTP challenge through the unified endpoint", async () => {
    const authService = createAuthService();
    const response = await createTestApi(undefined, authService).inject({
      method: "POST",
      url: "/v1/auth/otp/start",
      headers: {
        origin: "https://skillup.example",
        "user-agent": "SkillUp mobile test",
      },
      remoteAddress: "192.0.2.20",
      payload: { identity: "0300 1234567" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      challengeId: "22222222-2222-4222-8222-222222222222",
      channel: "phone",
      maskedDestination: "0300 *** 4567",
      expiresAt: "2026-07-30T00:10:00.000Z",
      message: "If delivery is available, a sign-in code has been sent.",
    });
    expect(authService.startSignIn).toHaveBeenCalledWith({
      identity: "0300 1234567",
      requestFingerprint: "192.0.2.20|SkillUp mobile test",
    });
  });

  it("verifies a unified challenge and sets the secure session boundary", async () => {
    const authService = createAuthService();
    const response = await createTestApi(undefined, authService).inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      headers: { origin: "https://skillup.example" },
      payload: {
        challengeId: "22222222-2222-4222-8222-222222222222",
        code: "1234",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ learner });
    expect(response.headers["set-cookie"]).toContain("skillup_session=test-session-token");
    expect(authService.verifySignIn).toHaveBeenCalledWith({
      challengeId: "22222222-2222-4222-8222-222222222222",
      code: "1234",
    });
  });

  it("lists and links verified login identities only for the authenticated learner", async () => {
    const authService = createAuthService();
    const listed = await createTestApi(undefined, authService).inject({
      method: "GET",
      url: "/v1/account/identities",
      headers: { cookie: "skillup_session=test-session-token" },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      identities: [{ type: "email", display: "learner@example.com" }],
    });

    const started = await createTestApi(undefined, authService).inject({
      method: "POST",
      url: "/v1/account/identities/start",
      headers: {
        origin: "https://skillup.example",
        cookie: "skillup_session=test-session-token",
      },
      payload: { identity: "+923001234567" },
    });
    expect(started.statusCode).toBe(202);
    expect(started.json()).toMatchObject({
      channel: "phone",
      maskedDestination: "0300 *** 4567",
    });
    expect(authService.startIdentityLink).toHaveBeenCalledWith({
      userId: learner.id,
      identity: "+923001234567",
      requestFingerprint: expect.any(String),
    });
  });

  it("rejects identity management without an authenticated session", async () => {
    const response = await createTestApi(undefined, createAuthService()).inject({
      method: "GET",
      url: "/v1/account/identities",
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("passwordless account routes", () => {
  it("starts an email challenge without returning the secret code", async () => {
    const authService = createAuthService();
    const response = await createTestApi(undefined, authService).inject({
      method: "POST",
      url: "/v1/auth/email/start",
      headers: {
        origin: "https://skillup.example",
        "user-agent": "SkillUp test browser",
      },
      remoteAddress: "192.0.2.10",
      payload: { email: " Learner@Example.com " },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      challengeId: "22222222-2222-4222-8222-222222222222",
      expiresAt: "2026-07-30T00:10:00.000Z",
      message: "If email delivery is available, a sign-in code has been sent.",
    });
    expect(response.body).not.toContain("123456");
    expect(authService.startEmailSignIn).toHaveBeenCalledWith({
      email: "Learner@Example.com",
      requestFingerprint: "192.0.2.10|SkillUp test browser",
    });
  });

  it("returns a bounded 400 contract for an invalid request payload", async () => {
    const authService = createAuthService();
    const response = await createTestApi(undefined, authService).inject({
      method: "POST",
      url: "/v1/auth/email/start",
      headers: { origin: "https://skillup.example" },
      payload: { email: "not-an-email" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "request_error",
      message: "The request payload is invalid.",
    });
    expect(authService.startEmailSignIn).not.toHaveBeenCalled();
  });

  it("returns 503 when sign-in email delivery is unavailable", async () => {
    const baseAuthService = createAuthService();
    const authService: AuthService = {
      ...baseAuthService,
      startEmailSignIn: vi.fn(async () => {
        const error = new Error("Sign-in email delivery is temporarily unavailable.");
        Object.assign(error, { statusCode: 503 });
        throw error;
      }),
    };
    const response = await createTestApi(undefined, authService).inject({
      method: "POST",
      url: "/v1/auth/email/start",
      headers: { origin: "https://skillup.example" },
      payload: { email: "learner@example.com" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "service_unavailable",
      message: "The requested service is temporarily unavailable.",
    });
  });

  it("rejects state-changing requests from an untrusted origin", async () => {
    const response = await createTestApi(undefined, createAuthService()).inject({
      method: "POST",
      url: "/v1/auth/email/start",
      headers: { origin: "https://attacker.example" },
      payload: { email: "learner@example.com" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "request_error" });
  });

  it("sets an HttpOnly SameSite session cookie after verification", async () => {
    const response = await createTestApi(undefined, createAuthService()).inject({
      method: "POST",
      url: "/v1/auth/email/verify",
      headers: { origin: "https://skillup.example" },
      payload: {
        challengeId: "22222222-2222-4222-8222-222222222222",
        code: "1234",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ learner });
    expect(response.headers["set-cookie"]).toContain("skillup_session=test-session-token");
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"]).not.toContain("Secure");
  });

  it("resolves a private learner session and rejects an invalid one", async () => {
    const authService = createAuthService();
    const valid = await createTestApi(undefined, authService).inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { cookie: "skillup_session=test-session-token" },
    });
    const invalid = await createTestApi(undefined, authService).inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { cookie: "skillup_session=invalid" },
    });

    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({ learner });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.headers["cache-control"]).toBe("no-store");
  });

  it("revokes and clears the current session on logout", async () => {
    const authService = createAuthService();
    const response = await createTestApi(undefined, authService).inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        origin: "https://skillup.example",
        cookie: "skillup_session=test-session-token",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(authService.revokeSession).toHaveBeenCalledWith("test-session-token");
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");
  });

  it("updates onboarding data only for the authenticated learner", async () => {
    const authService = createAuthService();
    const response = await createTestApi(undefined, authService).inject({
      method: "PATCH",
      url: "/v1/profile",
      headers: {
        origin: "https://skillup.example",
        cookie: "skillup_session=test-session-token",
      },
      payload: {
        displayName: "Areeba",
        locale: "en",
        ageBand: "18_24",
        learningGoal: "Prepare for my first job interview",
        onboardingStatus: "in_progress",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(authService.updateProfile).toHaveBeenCalledWith(learner.id, {
      displayName: "Areeba",
      locale: "en",
      ageBand: "18_24",
      learningGoal: "Prepare for my first job interview",
      onboardingStatus: "in_progress",
    });
  });
});
