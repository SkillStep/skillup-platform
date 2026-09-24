import { createTransport, type Transporter } from "nodemailer";

import type { AuthCodeDelivery } from "./auth.js";
import type { ApiConfig } from "./config.js";

type SignInMessage = Readonly<{
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: Readonly<Record<string, string>>;
}>;

type MailTransport = Readonly<{
  sendMail: (message: SignInMessage) => Promise<unknown>;
}>;

export type SmsTransport = Readonly<{
  send: (input: Readonly<{ to: string; body: string }>) => Promise<void>;
}>;

function formatExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(expiresAt);
}

function signInMessage(
  from: string,
  input: Readonly<{ email: string; code: string; expiresAt: Date }>,
): SignInMessage {
  const expiry = formatExpiry(input.expiresAt);
  return {
    from,
    to: input.email,
    subject: `${input.code} is your SkillUp sign-in code`,
    text: [
      "Sign in to SkillUp",
      "",
      `Your one-time code is: ${input.code}`,
      `It expires at ${expiry} UTC.`,
      "",
      "Do not share this code. SkillUp support will never ask for it.",
      "If you did not request this email, you can safely ignore it.",
    ].join("\n"),
    html: [
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">',
      '<h1 style="font-size:24px;margin:0 0 16px">Sign in to SkillUp</h1>',
      '<p style="margin:0 0 12px">Use this one-time code:</p>',
      `<p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:0 0 16px">${input.code}</p>`,
      `<p style="margin:0 0 12px">It expires at ${expiry} UTC.</p>`,
      '<p style="margin:0 0 12px">Do not share this code. SkillUp support will never ask for it.</p>',
      '<p style="color:#475569;margin:0">If you did not request this email, you can safely ignore it.</p>',
      "</div>",
    ].join(""),
    headers: {
      "X-Auto-Response-Suppress": "All",
      "X-Entity-Ref-ID": "skillup-passwordless-sign-in",
    },
  };
}

function smsSignInBody(code: string): string {
  return `Your SkillUp code is ${code}. It expires in 10 minutes. Do not share this code.`;
}

function requireSmtpCredential(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for SMTP delivery.`);
  return value;
}

function requireSmsCredential(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for Twilio SMS delivery.`);
  return value;
}

function serviceUnavailable(message: string): Error {
  const error = new Error(message);
  Object.assign(error, { statusCode: 503 });
  return error;
}

export function createSmtpTransport(config: ApiConfig): Transporter {
  if (config.EMAIL_PROVIDER !== "smtp") {
    throw new Error("SMTP transport cannot be created while email delivery is disabled.");
  }

  const host = requireSmtpCredential(config.SMTP_HOST, "SMTP_HOST");
  const username = requireSmtpCredential(config.SMTP_USERNAME, "SMTP_USERNAME");
  const password = requireSmtpCredential(config.SMTP_PASSWORD, "SMTP_PASSWORD");

  return createTransport({
    host,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: config.SMTP_REQUIRE_TLS,
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: {
      user: username,
      pass: password,
    },
  });
}

export function createTwilioSmsTransport(
  config: ApiConfig,
  fetchImpl: typeof fetch = fetch,
): SmsTransport {
  if ((config.SMS_PROVIDER ?? "disabled") !== "twilio") {
    throw new Error("Twilio transport cannot be created while SMS delivery is disabled.");
  }

  const accountSid = requireSmsCredential(config.TWILIO_ACCOUNT_SID, "TWILIO_ACCOUNT_SID");
  const authToken = requireSmsCredential(config.TWILIO_AUTH_TOKEN, "TWILIO_AUTH_TOKEN");
  const from = requireSmsCredential(config.TWILIO_PHONE_NUMBER, "TWILIO_PHONE_NUMBER");
  const timeoutSeconds = config.SMS_REQUEST_TIMEOUT_SECONDS ?? 10;

  return {
    send: async ({ to, body }) => {
      const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Body: body, From: from, To: to }),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutSeconds * 1_000),
      });

      if (!response.ok) {
        throw serviceUnavailable("Sign-in SMS delivery is temporarily unavailable.");
      }
    },
  };
}

export function createConfiguredAuthCodeDelivery(
  config: ApiConfig,
  transport?: MailTransport,
  smsTransport?: SmsTransport,
): AuthCodeDelivery {
  const smtp = config.EMAIL_PROVIDER === "smtp" ? (transport ?? createSmtpTransport(config)) : null;
  const sms =
    (config.SMS_PROVIDER ?? "disabled") === "twilio"
      ? (smsTransport ?? createTwilioSmsTransport(config))
      : null;

  return {
    sendSignInCode: async (input) => {
      if (input.channel === "email") {
        if (!smtp) {
          throw serviceUnavailable("Sign-in email delivery is temporarily unavailable.");
        }
        const from = requireSmtpCredential(config.EMAIL_FROM, "EMAIL_FROM");
        await smtp.sendMail(
          signInMessage(from, {
            email: input.destination,
            code: input.code,
            expiresAt: input.expiresAt,
          }),
        );
        return;
      }

      if (!sms) {
        throw serviceUnavailable("Sign-in SMS delivery is temporarily unavailable.");
      }
      await sms.send({
        to: input.destination,
        body: smsSignInBody(input.code),
      });
    },
  };
}
