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

function certificationUserAgent(identity) {
  const reference = createHash("sha256")
    .update(identity.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
  return `SkillUp-Staging-Certification/${reference}`;
}

async function retrieveOtp(identity, startedAfter) {
  const mailboxUrl = new URL(required("STAGING_QA_MAILBOX_URL"));
  mailboxUrl.searchParams.set("identity", identity);
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
      if (typeof body?.code === "string" && /^\d{4}$/.test(body.code)) return body.code;
    } else if (response.status !== 404) {
      throw new Error(`QA OTP bridge returned HTTP ${response.status}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`No staging OTP became available for the QA identity within ${OTP_WAIT_MS / 1_000} seconds.`);
}

export async function createAuthenticatedIdentityState(identity, statePath) {
  const baseURL = required("STAGING_WEB_URL");
  const origin = new URL(baseURL).origin;
  await fs.mkdir(path.dirname(statePath), { recursive: true });

  const context = await requestFactory.newContext({
    baseURL,
    extraHTTPHeaders: {
      origin,
      "user-agent": certificationUserAgent(identity),
    },
  });

  try {
    const startedAfter = new Date(Date.now() - 2_000).toISOString();
    const start = await context.post("/api/v1/auth/otp/start", { data: { identity } });
    if (!start.ok()) throw new Error(`OTP start failed with HTTP ${start.status()}.`);
    const challenge = await start.json();
    if (
      typeof challenge?.challengeId !== "string" ||
      (challenge?.channel !== "email" && challenge?.channel !== "sms")
    ) {
      throw new Error("OTP start did not return a valid challenge.");
    }

    const code = await retrieveOtp(identity, startedAfter);
    const verify = await context.post("/api/v1/auth/otp/verify", {
      data: { challengeId: challenge.challengeId, channel: challenge.channel, code },
    });
    if (!verify.ok()) throw new Error(`OTP verification failed with HTTP ${verify.status()}.`);

    await context.storageState({ path: statePath });
    return await verify.json();
  } finally {
    await context.dispose();
  }
}

export async function createAuthenticatedState(email, statePath) {
  return createAuthenticatedIdentityState(email, statePath);
}

export async function retrieveOtpForUi(identity, startedAfter) {
  return retrieveOtp(identity, startedAfter);
}

export function qaIdentity(name) {
  return required(name);
}
