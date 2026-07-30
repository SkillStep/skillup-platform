import { describe, expect, it } from "vitest";

import { BoundedRateLimitStore } from "./rate-limit.js";

describe("bounded request rate limiting", () => {
  it("allows the configured request count and blocks the next request", () => {
    let currentTime = 1_000;
    const store = new BoundedRateLimitStore({
      windowMs: 60_000,
      maxRequests: 2,
      maxEntries: 100,
      now: () => currentTime,
    });

    expect(store.consume("learner")).toMatchObject({ allowed: true, remaining: 1 });
    expect(store.consume("learner")).toMatchObject({ allowed: true, remaining: 0 });
    expect(store.consume("learner")).toMatchObject({ allowed: false, remaining: 0 });

    currentTime += 60_000;
    expect(store.consume("learner")).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("keeps different request identities isolated", () => {
    const store = new BoundedRateLimitStore({
      windowMs: 60_000,
      maxRequests: 1,
      maxEntries: 100,
      now: () => 1_000,
    });

    expect(store.consume("first").allowed).toBe(true);
    expect(store.consume("first").allowed).toBe(false);
    expect(store.consume("second").allowed).toBe(true);
  });

  it("rejects unsafe limiter configurations", () => {
    expect(
      () =>
        new BoundedRateLimitStore({
          windowMs: 999,
          maxRequests: 1,
          maxEntries: 100,
        }),
    ).toThrow("windowMs");
    expect(
      () =>
        new BoundedRateLimitStore({
          windowMs: 1_000,
          maxRequests: 0,
          maxEntries: 100,
        }),
    ).toThrow("maxRequests");
  });
});
