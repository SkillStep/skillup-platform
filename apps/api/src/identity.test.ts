import { describe, expect, it } from "vitest";

import {
  formatPakistanPhone,
  maskIdentity,
  normalizePakistanPhone,
  parseSignInIdentity,
} from "./identity.js";

describe("unified sign-in identity parsing", () => {
  it.each([
    ["03001234567", "+923001234567"],
    ["3001234567", "+923001234567"],
    ["923001234567", "+923001234567"],
    ["00923001234567", "+923001234567"],
    ["+923001234567", "+923001234567"],
    ["0300 123 4567", "+923001234567"],
  ])("normalizes Pakistani mobile format %s", (input, expected) => {
    expect(normalizePakistanPhone(input)).toBe(expected);
  });

  it("rejects non-Pakistani and malformed phone numbers", () => {
    expect(normalizePakistanPhone("+14155552671")).toBeNull();
    expect(normalizePakistanPhone("03001234")).toBeNull();
  });

  it("detects email and phone without a mode selector", () => {
    expect(parseSignInIdentity(" Learner@Example.COM ")).toEqual({
      channel: "email",
      normalized: "learner@example.com",
      display: "learner@example.com",
    });
    expect(parseSignInIdentity("03001234567")).toEqual({
      channel: "sms",
      normalized: "+923001234567",
      display: "0300 123 4567",
    });
  });

  it("masks destinations without exposing full identity", () => {
    expect(maskIdentity(parseSignInIdentity("learner@example.com"))).toBe("l******@example.com");
    expect(maskIdentity(parseSignInIdentity("03001234567"))).toBe("+92300 **** 567");
    expect(formatPakistanPhone("+923001234567")).toBe("0300 123 4567");
  });
});
