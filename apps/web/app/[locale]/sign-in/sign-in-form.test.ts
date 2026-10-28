import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./sign-in-form.tsx", import.meta.url), "utf8");

describe("sign-in form password flow", () => {
  it("collects name, mobile, password and confirm password without OTP", () => {
    expect(source).toContain("Full name");
    expect(source).toContain("Mobile number");
    expect(source).toContain("Confirm password");
    expect(source).toContain("/api/v1/auth/password/login");
    expect(source).not.toContain("/api/v1/auth/otp/");
    expect(source).toContain("LANDING_MSISDN_STORAGE_KEY");
    expect(source).toContain("displayName: trimmedName");
    expect(source).toContain("phoneLocked");
    expect(source).toContain("readOnly={phoneLocked}");
    expect(source).toContain("clearPremiumUnlockedFlag");
    expect(source).toContain('intent?: "sign-up" | "sign-in"');
    expect(source).toContain("Already have an account?");
    expect(source).toContain("Click here to Sign in");
  });
});
