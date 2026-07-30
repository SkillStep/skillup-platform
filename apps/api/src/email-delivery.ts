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
      "X-Entity-Ref-ID": `skillup-sign-in-${input.code.length}`,
    },
  };
}

export function createSmtpTransport(config: ApiConfig): Transporter {
  if (config.EMAIL_PROVIDER !== "smtp") {
    throw new Error("SMTP transport cannot be created while email delivery is disabled.");
  }

  return createTransport({
    host: config.SMTP_HOST,
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
      user: config.SMTP_USERNAME,
      pass: config.SMTP_PASSWORD,
    },
  });
}

export function createConfiguredAuthCodeDelivery(
  config: ApiConfig,
  transport?: MailTransport,
): AuthCodeDelivery {
  if (config.EMAIL_PROVIDER !== "smtp") {
    return {
      sendSignInCode: async () => {
        const error = new Error("Sign-in email delivery is temporarily unavailable.");
        Object.assign(error, { statusCode: 503 });
        throw error;
      },
    };
  }

  const smtp = transport ?? createSmtpTransport(config);
  const from = config.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is required for SMTP delivery.");

  return {
    sendSignInCode: async (input) => {
      await smtp.sendMail(signInMessage(from, input));
    },
  };
}
