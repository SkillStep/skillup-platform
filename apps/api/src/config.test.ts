import { describe, expect, it } from "vitest";

import { readApiConfig } from "./config.js";

const requiredEnvironment: NodeJS.ProcessEnv = {
  APP_ENV: "test",
  PUBLIC_APP_URL: "https://skillup.example",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  SESSION_SECRET: "test-only-session-secret-at-least-32-bytes",
};

describe("API runtime configuration", () => {
  it("uses the platform PORT when API_PORT is not explicitly set", () => {
    const config = readApiConfig({ ...requiredEnvironment, PORT: "8080" });

    expect(config.API_PORT).toBe(8080);
  });

  it("keeps explicit API_PORT authoritative", () => {
    const config = readApiConfig({
      ...requiredEnvironment,
      PORT: "8080",
      API_PORT: "3001",
    });

    expect(config.API_PORT).toBe(3001);
  });

  it("fails closed when SMTP is enabled without credentials", () => {
    expect(() =>
      readApiConfig({
        ...requiredEnvironment,
        EMAIL_PROVIDER: "smtp",
      }),
    ).toThrow("EMAIL_FROM is required when EMAIL_PROVIDER=smtp");
  });

  it("accepts a complete STARTTLS SMTP configuration", () => {
    const config = readApiConfig({
      ...requiredEnvironment,
      EMAIL_PROVIDER: "smtp",
      EMAIL_FROM: "no-reply@skillup.example",
      SMTP_HOST: "smtp.skillup.example",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      SMTP_REQUIRE_TLS: "true",
      SMTP_USERNAME: "skillup",
      SMTP_PASSWORD: "test-only-password",
    });

    expect(config.EMAIL_PROVIDER).toBe("smtp");
    expect(config.SMTP_REQUIRE_TLS).toBe(true);
    expect(config.SMTP_SECURE).toBe(false);
  });

  it("rejects implicit TLS on a non-465 port", () => {
    expect(() =>
      readApiConfig({
        ...requiredEnvironment,
        EMAIL_PROVIDER: "smtp",
        EMAIL_FROM: "no-reply@skillup.example",
        SMTP_HOST: "smtp.skillup.example",
        SMTP_PORT: "587",
        SMTP_SECURE: "true",
        SMTP_USERNAME: "skillup",
        SMTP_PASSWORD: "test-only-password",
      }),
    ).toThrow("SMTP_SECURE=true requires the implicit TLS port 465");
  });
});
