import { describe, expect, it, vi } from "vitest";

import {
  AuthRequestError,
  createAuthService,
  normalizeAuthIdentity,
  normalizePakistanMobile,
} from "./auth.js";

describe("unified authentication identity normalization", () => {
  it.each([
    ["0300 1234567", "+923001234567"],
    ["03001234567", "+923001234567"],
    ["+923001234567", "+923001234567"],
    ["923001234567", "+923001234567"],
    ["00923001234567", "+923001234567"],
    ["3001234567", "+923001234567"],
  ])("normalizes Pakistani mobile input %s", (input, expected) => {
    expect(normalizePakistanMobile(input)).toBe(expected);
  });

  it("normalizes email case and classifies identities without a mode toggle", () => {
    expect(normalizeAuthIdentity(" Learner@Example.COM ")).toEqual({
      type: "email",
      normalized: "learner@example.com",
      display: "learner@example.com",
      masked: "l***@example.com",
    });
    expect(normalizeAuthIdentity("0300-1234567")).toEqual({
      type: "phone",
      normalized: "+923001234567",
      display: "03001234567",
      masked: "0300 *** 4567",
    });
  });

  it.each([
    "123",
    "02001234567",
    "+92211234567",
    "+92300123456",
    "+9230012345678",
    "not-an-identity",
    "name@",
  ])("rejects invalid identity %s", (identity) => {
    expect(() => normalizeAuthIdentity(identity)).toThrow(AuthRequestError);
  });
});


describe("non-production OTP safety", () => {
  it.each([
    ["local", "local.admin@skillup.test"],
    ["staging", "staging.admin@skillup.test"],
    ["staging", "03123456789"],
  ])("uses generated OTP for %s identity %s rather than a shared code", async (appEnv, identity) => {
    const query = vi.fn(async () => ({
      rows: [{ identity_count: "0", fingerprint_count: "0" }],
    }));
    const sendSignInCode = vi.fn(async () => undefined);
    const auth = createAuthService({
      pool: { query } as unknown as Parameters<typeof createAuthService>[0]["pool"],
      secret: "non-production-test-secret-at-least-32-characters",
      challengeMinutes: 10,
      sessionIdleMinutes: 30,
      sessionAbsoluteHours: 24,
      delivery: { sendSignInCode },
      appEnv,
      createCode: () => "7392",
    });

    await auth.startSignIn({ identity, requestFingerprint: "qa-fixture-test" });

    expect(sendSignInCode).toHaveBeenCalledOnce();
    expect(sendSignInCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: "7392" }),
    );
  });
});
