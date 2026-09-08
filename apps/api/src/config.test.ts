import { describe, expect, it } from "vitest";

import { readApiConfig } from "./config.js";

const requiredEnvironment: NodeJS.ProcessEnv = {
  APP_ENV: "test",
  PUBLIC_APP_URL: "https://skillup.example",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  SESSION_SECRET: "test-only-session-secret-at-least-32-bytes",
};

const externalPaymentEnvironment: NodeJS.ProcessEnv = {
  ...requiredEnvironment,
  FEATURE_PREMIUM_ENABLED: "true",
  FEATURE_PAYMENT_SERVICE_ENABLED: "true",
  PAYMENT_SERVICE_BASE_URL: "https://payments.example",
  PAYMENT_SERVICE_API_KEY: "test-product-api-key-at-least-16",
  PAYMENT_SERVICE_WEBHOOK_SECRET: "test-webhook-secret-at-least-16",
  PAYMENT_SERVICE_APP_RETURN_URL: "https://skillup.example/en/account?billingReturn=1",
};

const sandboxJazzCashEnvironment: NodeJS.ProcessEnv = {
  ...requiredEnvironment,
  FEATURE_PREMIUM_ENABLED: "true",
  FEATURE_JAZZCASH_ENABLED: "true",
  JAZZCASH_MODE: "sandbox",
  JAZZCASH_MERCHANT_ID: "MC12345",
  JAZZCASH_PASSWORD: "sandbox-password",
  JAZZCASH_INTEGRITY_SALT: "sandbox-integrity-salt",
  JAZZCASH_PAYMENT_URL:
    "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
  JAZZCASH_RETURN_URL: "https://skillup.example/en/account/payment-return",
  JAZZCASH_STATUS_URL: "https://sandbox.example/jazzcash/status",
  JAZZCASH_REFUND_URL: "https://sandbox.example/jazzcash/refund",
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
    expect(() => readApiConfig({ ...requiredEnvironment, EMAIL_PROVIDER: "smtp" })).toThrow(
      "EMAIL_FROM is required when EMAIL_PROVIDER=smtp",
    );
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

  it("keeps premium, external payment service and direct JazzCash disabled by default", () => {
    const config = readApiConfig(requiredEnvironment);
    expect(config.FEATURE_PREMIUM_ENABLED).toBe(false);
    expect(config.FEATURE_PAYMENT_SERVICE_ENABLED).toBe(false);
    expect(config.FEATURE_JAZZCASH_ENABLED).toBe(false);
    expect(config.JAZZCASH_MODE).toBe("disabled");
  });

  it("accepts a complete external payment-service configuration", () => {
    const config = readApiConfig(externalPaymentEnvironment);
    expect(config.FEATURE_PAYMENT_SERVICE_ENABLED).toBe(true);
    expect(config.FEATURE_PREMIUM_ENABLED).toBe(true);
    expect(config.PAYMENT_SERVICE_MONTHLY_PLAN_CODE).toBe("monthly");
    expect(config.PAYMENT_SERVICE_YEARLY_PLAN_CODE).toBe("yearly");
    expect(config.PAYMENT_SERVICE_TIMEOUT_SECONDS).toBe(15);
    expect(config.FEATURE_JAZZCASH_ENABLED).toBe(false);
  });

  it("requires premium before the external payment service can be enabled", () => {
    expect(() =>
      readApiConfig({ ...externalPaymentEnvironment, FEATURE_PREMIUM_ENABLED: "false" }),
    ).toThrow("Premium must be enabled before the payment service can be enabled");
  });

  it("requires all server-only payment-service credentials", () => {
    expect(() =>
      readApiConfig({ ...externalPaymentEnvironment, PAYMENT_SERVICE_API_KEY: undefined }),
    ).toThrow("PAYMENT_SERVICE_API_KEY is required when the payment service is enabled");
    expect(() =>
      readApiConfig({ ...externalPaymentEnvironment, PAYMENT_SERVICE_WEBHOOK_SECRET: undefined }),
    ).toThrow("PAYMENT_SERVICE_WEBHOOK_SECRET is required when the payment service is enabled");
  });

  it("rejects direct JazzCash and payment-service modes together", () => {
    expect(() =>
      readApiConfig({
        ...externalPaymentEnvironment,
        ...sandboxJazzCashEnvironment,
        FEATURE_PAYMENT_SERVICE_ENABLED: "true",
        PAYMENT_SERVICE_BASE_URL: externalPaymentEnvironment["PAYMENT_SERVICE_BASE_URL"],
        PAYMENT_SERVICE_API_KEY: externalPaymentEnvironment["PAYMENT_SERVICE_API_KEY"],
        PAYMENT_SERVICE_WEBHOOK_SECRET:
          externalPaymentEnvironment["PAYMENT_SERVICE_WEBHOOK_SECRET"],
      }),
    ).toThrow("Direct JazzCash and external payment-service modes cannot be enabled together");
  });

  it("requires HTTPS payment-service URL in staging", () => {
    expect(() =>
      readApiConfig({
        ...externalPaymentEnvironment,
        APP_ENV: "staging",
        PAYMENT_SERVICE_BASE_URL: "http://payments.example",
      }),
    ).toThrow("PAYMENT_SERVICE_BASE_URL must use HTTPS outside local/test environments");
  });

  it("keeps payment-service app return on the SkillUp origin", () => {
    expect(() =>
      readApiConfig({
        ...externalPaymentEnvironment,
        PAYMENT_SERVICE_APP_RETURN_URL: "https://attacker.example/account",
      }),
    ).toThrow("The payment-service app return URL must use the public SkillUp origin");
  });

  it("requires distinct monthly and yearly external plan codes", () => {
    expect(() =>
      readApiConfig({
        ...externalPaymentEnvironment,
        PAYMENT_SERVICE_MONTHLY_PLAN_CODE: "premium",
        PAYMENT_SERVICE_YEARLY_PLAN_CODE: "premium",
      }),
    ).toThrow("Monthly and yearly payment-service plan codes must differ");
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

  it("requires CPS inquiry and refund endpoints before enabling direct JazzCash", () => {
    expect(() =>
      readApiConfig({ ...sandboxJazzCashEnvironment, JAZZCASH_STATUS_URL: undefined }),
    ).toThrow("JAZZCASH_STATUS_URL is required when JazzCash is enabled");
    expect(() =>
      readApiConfig({ ...sandboxJazzCashEnvironment, JAZZCASH_REFUND_URL: undefined }),
    ).toThrow("JAZZCASH_REFUND_URL is required when JazzCash is enabled");
  });

  it("accepts a complete isolated direct-JazzCash sandbox configuration", () => {
    const config = readApiConfig(sandboxJazzCashEnvironment);
    expect(config.JAZZCASH_MODE).toBe("sandbox");
    expect(config.FEATURE_PREMIUM_ENABLED).toBe(true);
    expect(config.FEATURE_JAZZCASH_ENABLED).toBe(true);
    expect(config.JAZZCASH_CHECKOUT_MINUTES).toBe(15);
    expect(config.JAZZCASH_CPS_TIMEOUT_SECONDS).toBe(15);
    expect(config.JAZZCASH_REFUND_ENVELOPE).toBe("refund-request");
  });

  it("rejects sandbox mode in production", () => {
    expect(() => readApiConfig({ ...sandboxJazzCashEnvironment, APP_ENV: "production" })).toThrow(
      "Production requires JAZZCASH_MODE=production",
    );
  });

  it("requires the direct JazzCash return URL to remain on the SkillUp origin", () => {
    expect(() =>
      readApiConfig({
        ...sandboxJazzCashEnvironment,
        JAZZCASH_RETURN_URL: "https://attacker.example/payment-return",
      }),
    ).toThrow("The JazzCash return URL must use the public SkillUp origin");
  });

  it("requires direct CPS endpoints to use HTTPS in staging", () => {
    expect(() =>
      readApiConfig({
        ...sandboxJazzCashEnvironment,
        APP_ENV: "staging",
        JAZZCASH_STATUS_URL: "http://sandbox.example/jazzcash/status",
      }),
    ).toThrow("JAZZCASH_STATUS_URL must use HTTPS outside local/test environments");
  });
});
