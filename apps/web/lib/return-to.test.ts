import { describe, expect, it } from "vitest";

import { safeReturnTo, withReturnTo } from "./return-to";

describe("safeReturnTo", () => {
  it("keeps an internal English learning destination", () => {
    expect(safeReturnTo("/en/learn/level-id?resume=1#challenge")).toBe(
      "/en/learn/level-id?resume=1#challenge",
    );
    expect(safeReturnTo("/en")).toBe("/en");
  });

  it("uses the first query value", () => {
    expect(safeReturnTo(["/en/progress", "/en/skills"])).toBe("/en/progress");
  });

  it.each([
    undefined,
    "",
    "https://attacker.example/en/learn/level-id",
    "//attacker.example/en/learn/level-id",
    "/\\attacker.example",
    "/ur/learn/level-id",
    "/en/sign-in",
    "/en/sign-in/again",
    "/en/onboarding",
    "/en/onboarding/again",
  ])("falls back for unsafe or looping destination %s", (candidate) => {
    expect(safeReturnTo(candidate)).toBe("/en");
  });
});

describe("withReturnTo", () => {
  it("encodes the complete internal destination", () => {
    expect(withReturnTo("/en/sign-in", "/en/learn/level-id?resume=1")).toBe(
      "/en/sign-in?returnTo=%2Fen%2Flearn%2Flevel-id%3Fresume%3D1",
    );
  });
});
