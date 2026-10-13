import { describe, expect, it } from "vitest";

import {
  AuthRequestError,
  FIXED_DEV_ADMIN_OTP,
  LOCAL_DEV_ADMIN_EMAIL,
  STAGING_DEV_ADMIN_EMAIL,
  normalizeAuthIdentity,
  normalizePakistanMobile,
  resolveFixedDevAdminOtp,
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

describe("fixed non-production admin OTP", () => {
  it("returns the fixed OTP only for the local and staging operator emails", () => {
    expect(
      resolveFixedDevAdminOtp({ type: "email", normalized: LOCAL_DEV_ADMIN_EMAIL }, "local"),
    ).toBe(FIXED_DEV_ADMIN_OTP);
    expect(
      resolveFixedDevAdminOtp({ type: "email", normalized: STAGING_DEV_ADMIN_EMAIL }, "staging"),
    ).toBe(FIXED_DEV_ADMIN_OTP);
  });

  it("never enables the fixed OTP in production or for other identities", () => {
    expect(
      resolveFixedDevAdminOtp({ type: "email", normalized: STAGING_DEV_ADMIN_EMAIL }, "production"),
    ).toBeNull();
    expect(
      resolveFixedDevAdminOtp({ type: "email", normalized: LOCAL_DEV_ADMIN_EMAIL }, "staging"),
    ).toBeNull();
    expect(
      resolveFixedDevAdminOtp({ type: "email", normalized: "someone@codistan.org" }, "staging"),
    ).toBeNull();
    expect(
      resolveFixedDevAdminOtp({ type: "phone", normalized: "+923001234567" }, "staging"),
    ).toBeNull();
  });
});
