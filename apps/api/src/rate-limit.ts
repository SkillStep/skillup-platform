import type { FastifyReply, FastifyRequest } from "fastify";

export type RateLimitOptions = Readonly<{
  windowMs: number;
  maxRequests: number;
  maxEntries: number;
  now?: () => number;
}>;

type WindowState = {
  count: number;
  resetAt: number;
  lastSeenAt: number;
};

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}>;

const bypassedPaths = new Set(["/v1/health", "/v1/ready", "/v1/version"]);

export class BoundedRateLimitStore {
  readonly #entries = new Map<string, WindowState>();
  readonly #windowMs: number;
  readonly #maxRequests: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(options: RateLimitOptions) {
    if (!Number.isInteger(options.windowMs) || options.windowMs < 1_000) {
      throw new Error("Rate-limit windowMs must be an integer of at least 1000.");
    }
    if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1) {
      throw new Error("Rate-limit maxRequests must be a positive integer.");
    }
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 100) {
      throw new Error("Rate-limit maxEntries must be an integer of at least 100.");
    }

    this.#windowMs = options.windowMs;
    this.#maxRequests = options.maxRequests;
    this.#maxEntries = options.maxEntries;
    this.#now = options.now ?? Date.now;
  }

  consume(key: string): RateLimitDecision {
    const currentTime = this.#now();
    let state = this.#entries.get(key);

    if (!state || state.resetAt <= currentTime) {
      this.#makeCapacity(currentTime);
      state = {
        count: 0,
        resetAt: currentTime + this.#windowMs,
        lastSeenAt: currentTime,
      };
      this.#entries.set(key, state);
    }

    state.count += 1;
    state.lastSeenAt = currentTime;

    return {
      allowed: state.count <= this.#maxRequests,
      limit: this.#maxRequests,
      remaining: Math.max(0, this.#maxRequests - state.count),
      resetAt: state.resetAt,
    };
  }

  #makeCapacity(currentTime: number): void {
    if (this.#entries.size < this.#maxEntries) return;

    for (const [key, state] of this.#entries) {
      if (state.resetAt <= currentTime) this.#entries.delete(key);
    }
    if (this.#entries.size < this.#maxEntries) return;

    let oldestKey: string | null = null;
    let oldestSeenAt = Number.POSITIVE_INFINITY;
    for (const [key, state] of this.#entries) {
      if (state.lastSeenAt < oldestSeenAt) {
        oldestKey = key;
        oldestSeenAt = state.lastSeenAt;
      }
    }
    if (oldestKey) this.#entries.delete(oldestKey);
  }
}

function routeKey(request: FastifyRequest): string {
  const route = request.routeOptions.url || request.url.split("?", 1)[0] || "unknown";
  return `${request.ip}:${request.method}:${route}`;
}

function secondsUntil(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1_000));
}

export function createRateLimitHook(options: RateLimitOptions) {
  const store = new BoundedRateLimitStore(options);
  const now = options.now ?? Date.now;

  return async function rateLimitHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const path = request.url.split("?", 1)[0] ?? request.url;
    if (bypassedPaths.has(path)) return;

    const decision = store.consume(routeKey(request));
    const resetSeconds = secondsUntil(decision.resetAt, now());
    reply.headers({
      "ratelimit-limit": String(decision.limit),
      "ratelimit-remaining": String(decision.remaining),
      "ratelimit-reset": String(resetSeconds),
    });

    if (decision.allowed) return;

    reply.header("retry-after", String(resetSeconds));
    await reply.status(429).send({
      code: "rate_limited",
      message: "Too many requests. Please wait and try again.",
      requestId: request.id,
    });
  };
}
