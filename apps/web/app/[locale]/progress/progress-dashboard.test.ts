import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./progress-dashboard.tsx", import.meta.url), "utf8");

describe("private progress dashboard source boundary", () => {
  it("uses server-derived progress endpoints and exact-session recovery", () => {
    expect(source).toContain("/api/v1/progress/summary");
    expect(source).toContain("/api/v1/progress/ledger");
    expect(source).toContain("/api/v1/progress/leaderboard");
    expect(source).toContain("skillup:level-session:");
    expect(source).toContain("Resume exact session");
  });

  it("states the leaderboard privacy boundary", () => {
    expect(source).toContain(
      "Real names, ages, contact details and learning history are never shown",
    );
    expect(source).toContain("Aliases only");
    expect(source).not.toContain("emailDisplay");
    expect(source).not.toContain("ageBand");
  });
});
