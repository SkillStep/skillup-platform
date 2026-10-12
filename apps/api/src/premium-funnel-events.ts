import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "./auth.js";
import type { ApiConfig } from "./config.js";
import {
  type PremiumAttribution,
  PremiumAttributionInputSchema,
  premiumAttributionJson,
  sanitizePremiumAttribution,
} from "./premium-attribution.js";
import {
  optionalAuthenticatedLearner,
  requireTrustedRequestOrigin,
} from "./request-auth.js";

/** Client-allowed funnel events only (ops funnel — not Subs source of truth). */
export const CLIENT_FUNNEL_EVENTS = [
  "paywall_viewed",
  "plan_selected",
  "add_to_cart",
] as const;

export type ClientFunnelEvent = (typeof CLIENT_FUNNEL_EVENTS)[number];

const FORBIDDEN_METADATA_KEYS = new Set([
  "otp",
  "mpin",
  "pin",
  "password",
  "token",
  "paymenttoken",
  "payment_token",
  "authorization",
  "msisdn",
  "phone",
  "cnic",
  "rawresponse",
  "securhash",
  "pp_securehash",
]);

const ClientFunnelEventSchema = z
  .object({
    event: z.enum(CLIENT_FUNNEL_EVENTS),
    source: z.string().trim().min(2).max(40).default("landing"),
    client: z.enum(["web", "android", "ios", "unknown"]).default("web"),
    planCode: z.enum(["premium-monthly", "premium-yearly"]).optional(),
    attribution: PremiumAttributionInputSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict();

function clipString(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/** Strip PII-like keys and bound metadata size before persistence. */
export function sanitizeFunnelMetadata(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined) return {};
  if (typeof input !== "object" || Array.isArray(input)) return {};

  const out: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key || key.length > 40) continue;
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue;
    if (rawValue === null || rawValue === undefined) continue;
    if (typeof rawValue === "string") {
      out[key] = clipString(rawValue, 120);
      continue;
    }
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      out[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "boolean") {
      out[key] = rawValue;
    }
  }
  return out;
}

export async function recordPremiumFunnelEvent(
  pool: DatabaseClient["pool"],
  input: Readonly<{
    userId: string | null;
    event: ClientFunnelEvent | "subscribe" | "purchase";
    planCode?: string | null;
    orderId?: string | null;
    entitlementId?: string | null;
    source?: string;
    client?: string;
    attribution?: PremiumAttribution;
    metadata?: Record<string, unknown>;
  }>,
): Promise<void> {
  const attribution = sanitizePremiumAttribution(input.attribution);
  const metadata = sanitizeFunnelMetadata(input.metadata);
  const properties = {
    ...metadata,
    source: input.source ?? "backend",
    client: input.client ?? "backend",
    attribution,
  };

  await pool.query(
    `insert into commercial_events (user_id, event_name, plan_code, order_id, entitlement_id, properties)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.userId,
      input.event,
      input.planCode ?? null,
      input.orderId ?? null,
      input.entitlementId ?? null,
      JSON.stringify(properties),
    ],
  );
}

export function registerPremiumFunnelEventRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    pool: DatabaseClient["pool"];
  }>,
): void {
  app.post("/v1/premium/analytics/events", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const body = ClientFunnelEventSchema.parse(request.body);
    const learner = await optionalAuthenticatedLearner(
      request,
      options.config,
      options.authService,
    );

    await recordPremiumFunnelEvent(options.pool, {
      userId: learner?.id ?? null,
      event: body.event,
      planCode: body.planCode ?? null,
      source: body.source,
      client: body.client,
      attribution: sanitizePremiumAttribution(body.attribution),
      metadata: body.metadata,
    });

    return reply.status(202).send({ accepted: true });
  });

  // Alias matching Maidan handoff naming.
  app.post("/v1/premium/events", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const body = ClientFunnelEventSchema.parse(request.body);
    const learner = await optionalAuthenticatedLearner(
      request,
      options.config,
      options.authService,
    );

    await recordPremiumFunnelEvent(options.pool, {
      userId: learner?.id ?? null,
      event: body.event,
      planCode: body.planCode ?? null,
      source: body.source,
      client: body.client,
      attribution: sanitizePremiumAttribution(body.attribution),
      metadata: body.metadata,
    });

    return reply.status(202).send({ accepted: true });
  });
}

export { premiumAttributionJson };
