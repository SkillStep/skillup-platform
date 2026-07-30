import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./level-player.tsx", import.meta.url), "utf8");

describe("playable level source boundary", () => {
  it("contains explicit loading, restoration and safe retry states", () => {
    expect(source).toContain("Preparing your level");
    expect(source).toContain("restoring your exact challenge and saved progress");
    expect(source).toContain("Retry same answer");
    expect(source).toContain("idempotencyKey: window.crypto.randomUUID()");
  });

  it("does not reference protected evaluator fields", () => {
    expect(source).not.toContain("privateEvaluation");
    expect(source).not.toContain("correctOptionKeys");
    expect(source).not.toContain("correctOrder");
    expect(source).not.toContain("rubric");
  });
});
