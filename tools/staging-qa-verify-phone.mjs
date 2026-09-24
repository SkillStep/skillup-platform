const POLL_INTERVAL_MS = 2_000;
const OTP_WAIT_MS = 60_000;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for staging phone OTP verification.`);
  return value;
}

async function readCode(phone, after) {
  const bridgeUrl = new URL(required("STAGING_QA_MAILBOX_URL"));
  bridgeUrl.searchParams.set("phone", phone);
  bridgeUrl.searchParams.set("after", after);
  const token = required("STAGING_QA_MAILBOX_TOKEN");
  const deadline = Date.now() + OTP_WAIT_MS;

  while (Date.now() < deadline) {
    const response = await fetch(bridgeUrl, {
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
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
  throw new Error("No staging phone OTP challenge became available.");
}

const base = required("STAGING_WEB_URL");
const origin = new URL(base).origin;
const phone = required("STAGING_QA_PHONE");
const startedAfter = new Date(Date.now() - 2_000).toISOString();

const start = await fetch(new URL("/api/v1/auth/otp/start", base), {
  method: "POST",
  headers: {
    origin,
    "content-type": "application/json",
    "user-agent": "SkillUp-Staging-Phone-Certification",
  },
  body: JSON.stringify({ identity: phone }),
  signal: AbortSignal.timeout(20_000),
});
if (!start.ok) throw new Error(`Phone OTP start failed with HTTP ${start.status}.`);
const challenge = await start.json();
if (challenge?.channel !== "phone" || typeof challenge?.challengeId !== "string") {
  throw new Error("Phone OTP start did not return the expected phone challenge.");
}

const code = await readCode(phone, startedAfter);
const verifyResponse = await fetch(new URL("/api/v1/auth/otp/verify", base), {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ challengeId: challenge.challengeId, code }),
  signal: AbortSignal.timeout(20_000),
});
if (!verifyResponse.ok) {
  throw new Error(`Phone OTP verification failed with HTTP ${verifyResponse.status}.`);
}
const verified = await verifyResponse.json();
if (!verified?.learner?.phone) {
  throw new Error("Verified phone sign-in did not resolve a learner phone identity.");
}

console.log("STAGING PHONE OTP: PASS — Twilio accepted the SMS request and the exact public OTP challenge verified.");
