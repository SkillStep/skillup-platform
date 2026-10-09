import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./sign-in-form.tsx", import.meta.url), "utf8");

describe("sign-in form full name", () => {
  it("collects full name with identity and sends displayName on verify", () => {
    expect(source).toContain("Full name");
    expect(source).toContain('name="fullName"');
    expect(source).toContain("displayName: fullName.trim()");
    expect(source).toContain("/api/v1/auth/otp/verify");
  });
});
