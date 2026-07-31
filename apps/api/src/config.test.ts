import { describe, expect, it } from "vitest";

import { readApiConfig } from "./config.js";

const requiredEnvironment: NodeJS.ProcessEnv = {
  APP_ENV: "test",
  PUBLIC_APP_URL: "https://skillup.example",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  SESSION_SECRET: "test-only-session-secret-at-least-32-bytes",
};

const sandboxJazzCashEnvironment: NodeJS.ProcessEnv = {
  ...requiredEnvironment,
  FEATURE_PREMIUM_ENABLED: "true",
  FEATURE_JAZZCASH_ENABLED: "true",
  JAZZCASH_MODE: "sandbox",
  JAZZCASH_MERCHANT_ID: "MC12345",
  JAZZCASH_PASSWORD: "sandbox-password",
  JAZZCASH_INTEGRITY_SALT: "sandbox-integrity-salt",
  JAZZCASH_PAYMENT_URL: "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
  JAZZCASH_RETURN_URL: "https://skillup.example/en/account/payment-return",
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

  it("keeps premium and JazzCash disabled by default", () => {
    const config = readApiConfig(requiredEnvironment);

    expect(config.FEATURE_PREMIUM_ENABLED).toBe(false);
    expect(config.FEATURE_JAZZCASH_ENABLED).toBe(false);
    expect(config.JAZZCASH_MODE).toBe("disabled");
  });

  it("rejects JazzCash without premium", () => {
    expect(() =>
      readApiConfig({
        ...sandboxJazzCashEnvironment,
        FEATURE_PREMIUM_ENABLED: "false",
      }),
    ).toThrow("Premium must be enabled before JazzCash checkout can be enabled");
  });

  it("rejects enabled JazzCash with incomplete credentials", () => {
    expect(() =>
      readApiConfig({
        ...requiredEnvironment,
        FEATURE_PREMIUM_ENABLED: "true",
        FEATURE_JAZZCASH_ENABLED: "true",
        JAZZCASH_MODE: "sandbox",
      }),
    ).toThrow("JAZZCASH_MERCHANT_ID is required when JazzCash is enabled");
  });

  it("accepts a complete isolated sandbox configuration", () => {
    const config = readApiConfig(sandboxJazzCashEnvironment);

    expect(config.JAZZCASH_MODE).toBe("sandbox");
    expect(config.FEATURE_PREMIUM_ENABLED).toBe(true);
    expect(config.FEATURE_JAZZCASH_ENABLED).toBe(true);
    expect(config.JAZZCASH_CHECKOUT_MINUTES).toBe(15);
  });

  it("rejects sandbox mode in production", () => {
    expect(() =>
      readApiConfig({
        ...sandboxJazzCashEnvironment,
        APP_ENV: "production",
      }),
    ).toThrow("Production requires JAZZCASH_MODE=production");
  });

  it("requires the JazzCash return URL to remain on the SkillUp origin", () => {
    expect(() =>
      readApiConfig({
        ...sandboxJazzCashEnvironment,
        JAZZCASH_RETURN_URL: "https://attacker.example/payment-return",
      }),
    ).toThrow("The JazzCash return URL must use the public SkillUp origin");
  });
});
