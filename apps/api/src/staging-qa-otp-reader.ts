import { createHmac, timingSafeEqual } from "node:crypto";

const QA_EMAILS = new Set([
  "skillup+qa-learner@codistan.org",
  "skillup+qa-free-learner@codistan.org",
  "skillup+qa-onboarding@codistan.org",
  "skillup+qa-auth-negative@codistan.org",
  "skillup+qa-session@codistan.org",
  "skillup+qa-admin@codistan.org",
  "skillup+qa-analyst@codistan.org",
  "skillup+qa-content-editor@codistan.org",
  "skillup+qa-content-reviewer@codistan.org",
  "skillup+qa-publisher@codistan.org",
  "skillup+qa-payment-operator@codistan.org",
  "skillup+qa-learner-support@codistan.org",
  "skillup+qa-security-admin@codistan.org",
  "skillup+qa-revoked-admin@codistan.org",
]);

const MAX_LOOKBACK_MS = 10 * 60_000;
const CLOCK_SKEW_MS = 10_000;

export function normalizeStagingQaEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function isAllowedStagingQaEmail(value: string): boolean {
  return QA_EMAILS.has(normalizeStagingQaEmail(value));
}

export function parseStagingQaAfter(value: string, now = Date.now()): Date {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("STAGING_QA_OTP_AFTER must be a valid ISO timestamp.");
  if (timestamp > now + CLOCK_SKEW_MS) throw new Error("STAGING_QA_OTP_AFTER cannot be in the future.");
  if (timestamp < now - MAX_LOOKBACK_MS) {
    throw new Error("STAGING_QA_OTP_AFTER is outside the allowed QA lookup window.");
  }
  return new Date(timestamp);
}

export function recoverStagingQaOtp(
  secret: string,
  challengeId: string,
  expectedDigest: string,
): string | null {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error("The staging QA challenge digest is invalid.");
  }

  const expected = Buffer.from(expectedDigest, "hex");
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const code = candidate.toString().padStart(4, "0");
    const digest = createHmac("sha256", secret)
      .update(`challenge:${challengeId}:${code}`)
      .digest();
    if (timingSafeEqual(digest, expected)) return code;
  }

  return null;
}
