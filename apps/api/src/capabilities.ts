import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

import type { AuthService, AuthenticatedLearner } from "./auth.js";
import type { ApiConfig } from "./config.js";

const CapabilityViewSchema = z.object({
  tier: z.enum(["free", "premium"]),
  unlimitedMissions: z.boolean(),
  dailyFreeMissionLimit: z.number().int().min(0),
  missionsUsedToday: z.number().int().min(0),
  missionsRemainingToday: z.number().int().min(0).nullable(),
  premiumPaths: z.boolean(),
  advancedChallenges: z.boolean(),
  detailedInsights: z.boolean(),
  premiumAvatars: z.boolean(),
  prioritySupport: z.boolean(),
  aiPersonalization: z.boolean(),
  entitlementEndsAt: z.iso.datetime().nullable(),
});

export type CapabilityView = z.infer<typeof CapabilityViewSchema>;

export class CapabilityServiceError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "CapabilityServiceError";
    this.statusCode = statusCode;
  }
}

type EntitlementRow = Readonly<{
  capabilities: unknown;
  ends_at: Date;
  grace_ends_at: Date | null;
}>;

type UsageRow = Readonly<{ missions_started: number }>;

const FREE_MISSION_LIMIT = 3;
const PREMIUM_CAPABILITIES = new Set([
  "unlimited_missions",
  "premium_paths",
  "advanced_challenges",
  "detailed_insights",
  "premium_avatars",
  "priority_support",
  "ai_personalization",
]);

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function stringSet(value: unknown): Set<string> {
  const parsed = z.array(z.string()).safeParse(value);
  return parsed.success ? new Set(parsed.data) : new Set<string>();
}

async function activeEntitlement(
  database: Pick<DatabaseClient["pool"], "query"> | PoolClient,
  userId: string,
  at: Date,
): Promise<EntitlementRow | null> {
  const result = await database.query<EntitlementRow>(
    `select cpv.capabilities, e.ends_at, e.grace_ends_at
       from entitlements e
       join commercial_plan_versions cpv on cpv.id = e.plan_version_id
      where e.user_id = $1
        and e.status in ('active', 'grace')
        and e.starts_at <= $2
        and coalesce(e.grace_ends_at, e.ends_at) > $2
      order by coalesce(e.grace_ends_at, e.ends_at) desc
      limit 1`,
    [userId, at],
  );
  return result.rows[0] ?? null;
}

async function usageToday(
  database: Pick<DatabaseClient["pool"], "query"> | PoolClient,
  userId: string,
  at: Date,
): Promise<number> {
  const result = await database.query<UsageRow>(
    `select missions_started
       from learner_daily_mission_usage
      where user_id = $1 and usage_date = $2::date`,
    [userId, utcDate(at)],
  );
  return result.rows[0]?.missions_started ?? 0;
}

function viewFrom(entitlement: EntitlementRow | null, used: number): CapabilityView {
  const planCapabilities = entitlement ? stringSet(entitlement.capabilities) : new Set<string>();
  const premium = entitlement !== null;
  const has = (key: string): boolean =>
    premium &&
    (planCapabilities.size === 0 || planCapabilities.has(key) || PREMIUM_CAPABILITIES.has(key));

  return CapabilityViewSchema.parse({
    tier: premium ? "premium" : "free",
    unlimitedMissions: premium,
    dailyFreeMissionLimit: FREE_MISSION_LIMIT,
    missionsUsedToday: used,
    missionsRemainingToday: premium ? null : Math.max(0, FREE_MISSION_LIMIT - used),
    premiumPaths: has("premium_paths"),
    advancedChallenges: has("advanced_challenges"),
    detailedInsights: has("detailed_insights"),
    premiumAvatars: has("premium_avatars"),
    prioritySupport: has("priority_support"),
    aiPersonalization: has("ai_personalization"),
    entitlementEndsAt: entitlement
      ? (entitlement.grace_ends_at ?? entitlement.ends_at).toISOString()
      : null,
  });
}

export type CapabilityService = Readonly<{
  get: (userId: string) => Promise<CapabilityView>;
  authorizeMissionStart: (
    database: PoolClient,
    userId: string,
    at: Date,
  ) => Promise<CapabilityView>;
}>;

export function createCapabilityService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    now?: () => Date;
  }>,
): CapabilityService {
  const now = options.now ?? (() => new Date());

  return {
    get: async (userId) => {
      const at = now();
      const [entitlement, used] = await Promise.all([
        activeEntitlement(options.pool, userId, at),
        usageToday(options.pool, userId, at),
      ]);
      return viewFrom(entitlement, used);
    },

    authorizeMissionStart: async (database, userId, at) => {
      const entitlement = await activeEntitlement(database, userId, at);
      if (entitlement) {
        const used = await usageToday(database, userId, at);
        return viewFrom(entitlement, used);
      }

      const usage = await database.query<UsageRow>(
        `insert into learner_daily_mission_usage
          (user_id, usage_date, missions_started, updated_at)
         values ($1, $2::date, 1, $3)
         on conflict (user_id, usage_date) do update
           set missions_started = learner_daily_mission_usage.missions_started + 1,
               updated_at = excluded.updated_at
         where learner_daily_mission_usage.missions_started < $4
         returning missions_started`,
        [userId, utcDate(at), at, FREE_MISSION_LIMIT],
      );
      const row = usage.rows[0];
      if (!row) {
        throw new CapabilityServiceError(
          402,
          "The daily free mission limit has been reached. Upgrade to continue learning today.",
        );
      }
      return viewFrom(null, row.missions_started);
    },
  };
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [candidateName, ...valueParts] = part.trim().split("=");
    if (candidateName === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

async function requireLearner(
  request: FastifyRequest,
  config: ApiConfig,
  authService: AuthService,
): Promise<AuthenticatedLearner> {
  const sessionToken = parseCookie(request.headers.cookie, config.SESSION_COOKIE_NAME);
  if (!sessionToken) throw new CapabilityServiceError(401, "Authentication is required.");
  const learner = await authService.resolveSession(sessionToken);
  if (!learner) throw new CapabilityServiceError(401, "The session is invalid or expired.");
  return learner;
}

export function registerCapabilityRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    capabilityService: CapabilityService;
  }>,
): void {
  app.get("/v1/account/capabilities", async (request) => {
    const learner = await requireLearner(request, options.config, options.authService);
    return options.capabilityService.get(learner.id);
  });
}
