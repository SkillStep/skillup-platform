import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { request as requestFactory } from "@playwright/test";

const POLL_INTERVAL_MS = 2_000;
const OTP_WAIT_MS = 60_000;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for authenticated staging certification.`);
  return value;
}

function certificationUserAgent(email) {
  const reference = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
  return `SkillUp-Staging-Certification/${reference}`;
}

async function retrieveOtp(email, startedAfter) {
  const mailboxUrl = new URL(required("STAGING_QA_MAILBOX_URL"));
  mailboxUrl.searchParams.set("email", email);
  mailboxUrl.searchParams.set("after", startedAfter);
  const token = required("STAGING_QA_MAILBOX_TOKEN");
  const deadline = Date.now() + OTP_WAIT_MS;

  while (Date.now() < deadline) {
    const response = await fetch(mailboxUrl, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      const body = await response.json();
      if (typeof body?.code === "string" && /^\d{6}$/.test(body.code)) return body.code;
    } else if (response.status !== 404) {
      throw new Error(`QA mailbox returned HTTP ${response.status}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`No staging OTP arrived for ${email} within ${OTP_WAIT_MS / 1_000} seconds.`);
}

export async function createAuthenticatedState(email, statePath) {
  const baseURL = required("STAGING_WEB_URL");
  const origin = new URL(baseURL).origin;
  await fs.mkdir(path.dirname(statePath), { recursive: true });

  const context = await requestFactory.newContext({
    baseURL,
    extraHTTPHeaders: {
      origin,
      "user-agent": certificationUserAgent(email),
    },
  });

  try {
    const startedAfter = new Date(Date.now() - 2_000).toISOString();
    const start = await context.post("/api/v1/auth/email/start", { data: { email } });
    if (!start.ok()) throw new Error(`OTP start failed with HTTP ${start.status()}.`);
    const challenge = await start.json();
    if (typeof challenge?.challengeId !== "string") {
      throw new Error("OTP start did not return a challenge identifier.");
    }

    const code = await retrieveOtp(email, startedAfter);
    const verify = await context.post("/api/v1/auth/email/verify", {
      data: { challengeId: challenge.challengeId, code },
    });
    if (!verify.ok()) throw new Error(`OTP verification failed with HTTP ${verify.status()}.`);

    await context.storageState({ path: statePath });
  } finally {
    await context.dispose();
  }
}

export async function retrieveOtpForUi(email, startedAfter) {
  return retrieveOtp(email, startedAfter);
}

export function qaIdentity(name) {
  return required(name);
}
