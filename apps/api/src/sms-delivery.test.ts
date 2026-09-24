import { describe, expect, it, vi } from "vitest";

import { readApiConfig } from "./config.js";
import { createConfiguredSmsCodeDelivery } from "./sms-delivery.js";

const base = {
  APP_ENV: "test",
  PUBLIC_APP_URL: "https://skillup.example",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  SESSION_SECRET: "test-only-session-secret-at-least-32-bytes",
} as const;

describe("Twilio SMS OTP delivery", () => {
  it("sends only the bounded OTP message to the normalized number", async () => {
    const config = readApiConfig({
      ...base,
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "test-account-sid",
      TWILIO_AUTH_TOKEN: "test-only-auth-token-value",
      TWILIO_FROM_NUMBER: "+15005550006",
    });
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ sid: "test-message-id" }), { status: 201 }),
    );
    const delivery = createConfiguredSmsCodeDelivery(config, fetcher as typeof fetch);

    await delivery.sendSignInCode({
      phone: "+923001234567",
      code: "1234",
      expiresAt: new Date("2026-09-24T10:10:00Z"),
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain("/Accounts/test-account-sid/Messages.json");
    expect(String(init?.body)).toContain("To=%2B923001234567");
    expect(String(init?.body)).toContain("Your+SkillUp+code+is+1234");
    expect(String(init?.body)).not.toContain("test-only-auth-token-value");
  });

  it("fails closed when SMS delivery is disabled", async () => {
    const config = readApiConfig(base);
    await expect(
      createConfiguredSmsCodeDelivery(config).sendSignInCode({
        phone: "+923001234567",
        code: "1234",
        expiresAt: new Date(),
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("maps provider failures to a safe service-unavailable error", async () => {
    const config = readApiConfig({
      ...base,
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "test-account-sid",
      TWILIO_AUTH_TOKEN: "test-only-auth-token-value",
      TWILIO_FROM_NUMBER: "+15005550006",
    });
    const fetcher = vi.fn(async () => new Response("provider detail", { status: 429 }));
    await expect(
      createConfiguredSmsCodeDelivery(config, fetcher as typeof fetch).sendSignInCode({
        phone: "+923001234567",
        code: "1234",
        expiresAt: new Date(),
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
