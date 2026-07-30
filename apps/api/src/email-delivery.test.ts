import { describe, expect, it, vi } from "vitest";

import { readApiConfig } from "./config.js";
import { createConfiguredAuthCodeDelivery } from "./email-delivery.js";

const smtpConfig = readApiConfig({
  APP_ENV: "test",
  PUBLIC_APP_URL: "https://skillup.example",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  SESSION_SECRET: "test-only-session-secret-at-least-32-bytes",
  EMAIL_PROVIDER: "smtp",
  EMAIL_FROM: "no-reply@skillup.example",
  SMTP_HOST: "smtp.skillup.example",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_REQUIRE_TLS: "true",
  SMTP_USERNAME: "skillup",
  SMTP_PASSWORD: "test-only-password",
});

describe("configured authentication email delivery", () => {
  it("sends a bounded one-time-code message without session or profile data", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "test-message" }));
    const delivery = createConfiguredAuthCodeDelivery(smtpConfig, { sendMail });

    await delivery.sendSignInCode({
      email: "learner@example.com",
      code: "123456",
      expiresAt: new Date("2026-07-30T12:10:00.000Z"),
    });

    expect(sendMail).toHaveBeenCalledOnce();
    const message = sendMail.mock.calls[0]?.[0];
    expect(message).toMatchObject({
      from: "no-reply@skillup.example",
      to: "learner@example.com",
      subject: "123456 is your SkillUp sign-in code",
    });
    expect(message?.text).toContain("Your one-time code is: 123456");
    expect(message?.text).toContain("Do not share this code");
    expect(JSON.stringify(message)).not.toContain("sessionToken");
    expect(JSON.stringify(message)).not.toContain("learningGoal");
  });

  it("fails safely while production delivery is disabled", async () => {
    const disabled = readApiConfig({
      APP_ENV: "test",
      PUBLIC_APP_URL: "https://skillup.example",
      DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
      SESSION_SECRET: "test-only-session-secret-at-least-32-bytes",
      EMAIL_PROVIDER: "disabled",
    });
    const delivery = createConfiguredAuthCodeDelivery(disabled);

    await expect(
      delivery.sendSignInCode({
        email: "learner@example.com",
        code: "123456",
        expiresAt: new Date("2026-07-30T12:10:00.000Z"),
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
