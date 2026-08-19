import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  isAllowedStagingQaEmail,
  normalizeStagingQaEmail,
  parseStagingQaAfter,
  recoverStagingQaOtp,
} from "./staging-qa-otp-reader.js";

describe("staging QA OTP reader", () => {
  it("allows only the fixed SkillUp staging QA aliases", () => {
    expect(isAllowedStagingQaEmail(" SkillUp+QA-Learner@Codistan.org ")).toBe(true);
    expect(isAllowedStagingQaEmail("skillup+qa-random@codistan.org")).toBe(false);
    expect(isAllowedStagingQaEmail("user@example.com")).toBe(false);
    expect(normalizeStagingQaEmail(" SkillUp+QA-Admin@Codistan.org ")).toBe(
      "skillup+qa-admin@codistan.org",
    );
  });

  it("accepts only a recent lookup timestamp", () => {
    const now = Date.parse("2026-08-19T17:00:00.000Z");
    expect(parseStagingQaAfter("2026-08-19T16:59:58.000Z", now).toISOString()).toBe(
      "2026-08-19T16:59:58.000Z",
    );
    expect(() => parseStagingQaAfter("2026-08-19T16:40:00.000Z", now)).toThrow(
      /outside the allowed QA lookup window/,
    );
    expect(() => parseStagingQaAfter("not-a-date", now)).toThrow(/valid ISO timestamp/);
  });

  it("recovers only the exact four-digit code represented by the challenge digest", () => {
    const secret = "a-secure-staging-test-secret-that-is-long-enough";
    const challengeId = "11111111-2222-4333-8444-555555555555";
    const expectedCode = "0427";
    const digest = createHmac("sha256", secret)
      .update(`challenge:${challengeId}:${expectedCode}`)
      .digest("hex");

    expect(recoverStagingQaOtp(secret, challengeId, digest)).toBe(expectedCode);
    expect(recoverStagingQaOtp(secret, challengeId, "0".repeat(64))).toBeNull();
    expect(() => recoverStagingQaOtp(secret, challengeId, "invalid")).toThrow(
      /challenge digest is invalid/,
    );
  });
});
