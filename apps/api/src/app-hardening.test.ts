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
  RELEASE_SHA: "test-sha",
  LOG_LEVEL: "silent",
};

const authService: AuthService = {
  startEmailSignIn: vi.fn(async () => ({
    challengeId: "22222222-2222-4222-8222-222222222222",
    expiresAt: new Date("2026-07-30T00:10:00.000Z"),
  })),
  verifyEmailSignIn: vi.fn(async () => {
    throw new Error("Not used by this test.");
  }),
  resolveSession: vi.fn(async () => null),
  revokeSession: vi.fn(async () => undefined),
  updateProfile: vi.fn(async () => {
    throw new Error("Not used by this test.");
  }),
};

function track(app: ReturnType<typeof buildApi>) {
  applications.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe("API production hardening", () => {
  it("sets defensive headers on API responses", async () => {
    const response = await track(buildApi({ config: testConfig })).inject({
      method: "GET",
      url: "/v1/unknown",
    });

    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(response.headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(response.headers["permissions-policy"]).toContain("payment=()");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("limits repeated requests while leaving health checks available", async () => {
    const app = track(
      buildApi({
        config: testConfig,
        authService,
        rateLimit: {
          windowMs: 60_000,
          maxRequests: 1,
          maxEntries: 100,
          now: () => 1_000,
        },
      }),
    );

    const first = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      remoteAddress: "192.0.2.20",
    });
    const blocked = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      remoteAddress: "192.0.2.20",
    });
    const health = await app.inject({
      method: "GET",
      url: "/v1/health",
      remoteAddress: "192.0.2.20",
    });

    expect(first.statusCode).toBe(401);
    expect(first.headers["ratelimit-remaining"]).toBe("0");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
    expect(blocked.json()).toMatchObject({ code: "rate_limited" });
    expect(health.statusCode).toBe(200);
    expect(health.headers["ratelimit-limit"]).toBeUndefined();
  });

  it("rejects request bodies larger than the reviewed API boundary", async () => {
    const response = await track(buildApi({ config: testConfig, authService })).inject({
      method: "POST",
      url: "/v1/auth/email/start",
      headers: { origin: "https://skillup.example" },
      payload: { email: `${"a".repeat(140_000)}@example.com` },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: "request_error" });
  });
});
