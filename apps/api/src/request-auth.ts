import type { FastifyRequest } from "fastify";

import type { AuthService, AuthenticatedLearner } from "./auth.js";
import type { ApiConfig } from "./config.js";

export class RequestAuthorizationError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "RequestAuthorizationError";
    this.statusCode = statusCode;
  }
}

export function parseRequestCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [candidateName, ...valueParts] = part.trim().split("=");
    if (candidateName === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

export function requireTrustedRequestOrigin(request: FastifyRequest, config: ApiConfig): void {
  const origin = request.headers.origin;
  if (!origin) return;
  if (origin !== new URL(config.PUBLIC_APP_URL).origin) {
    throw new RequestAuthorizationError(403, "The request origin is not allowed.");
  }
}

export async function requireAuthenticatedLearner(
  request: FastifyRequest,
  config: ApiConfig,
  authService: AuthService,
): Promise<AuthenticatedLearner> {
  const sessionToken = parseRequestCookie(request.headers.cookie, config.SESSION_COOKIE_NAME);
  if (!sessionToken) {
    throw new RequestAuthorizationError(401, "Authentication is required.");
  }
  const learner = await authService.resolveSession(sessionToken);
  if (!learner) {
    throw new RequestAuthorizationError(401, "The session is invalid or expired.");
  }
  return learner;
}
