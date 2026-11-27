import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import type { ApiConfig } from "./config.js";
import { requireTrustedRequestOrigin, RequestAuthorizationError } from "./request-auth.js";

const config = { PUBLIC_APP_URL: "http://localhost:3000" } as ApiConfig;

function request(origin: string | undefined): FastifyRequest {
  return { headers: { origin } } as FastifyRequest;
}

describe("trusted request origin", () => {
  it("allows the configured origin and the IPv4 loopback equivalent", () => {
    expect(() =>
      requireTrustedRequestOrigin(request("http://localhost:3000"), config),
    ).not.toThrow();
    expect(() =>
      requireTrustedRequestOrigin(request("http://127.0.0.1:3000"), config),
    ).not.toThrow();
    expect(() => requireTrustedRequestOrigin(request(undefined), config)).not.toThrow();
  });

  it("rejects a different host", () => {
    expect(() => requireTrustedRequestOrigin(request("http://evil.example"), config)).toThrow(
      RequestAuthorizationError,
    );
  });
});
