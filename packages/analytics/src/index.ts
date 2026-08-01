export const ANALYTICS_EVENTS = [
  "public_page_viewed",
  "search_performed",
  "skill_viewed",
  "path_viewed",
  "guide_viewed",
  "question_viewed",
  "glossary_viewed",
  "comparison_viewed",
  "registration_started",
  "registration_completed",
  "onboarding_started",
  "onboarding_completed",
  "assessment_started",
  "assessment_completed",
  "level_started",
  "challenge_submitted",
  "challenge_retried",
  "level_completed",
  "path_completed",
  "achievement_unlocked",
  "achievement_shared",
  "leaderboard_opted_in",
  "pricing_viewed",
  "upgrade_started",
  "payment_started",
  "payment_pending",
  "payment_verified",
  "payment_failed",
  "premium_activated",
  "premium_expired",
  "refund_completed",
  "first_premium_action",
  "ai_generation_requested",
  "ai_generation_completed",
  "ai_generation_failed",
  "ai_artifact_reviewed",
  "ai_artifact_published",
  "support_requested",
  "content_reported",
  "account_export_requested",
  "account_deletion_requested",
  "reliability_error_observed",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const ESSENTIAL_ANALYTICS_EVENTS = [
  "registration_started",
  "registration_completed",
  "level_started",
  "level_completed",
  "payment_started",
  "payment_pending",
  "payment_verified",
  "payment_failed",
  "premium_activated",
  "premium_expired",
  "refund_completed",
  "ai_generation_requested",
  "ai_generation_completed",
  "ai_generation_failed",
  "account_export_requested",
  "account_deletion_requested",
  "reliability_error_observed",
] as const satisfies readonly AnalyticsEventName[];

export type AnalyticsEvent = Readonly<{
  name: AnalyticsEventName;
  occurredAt: string;
  anonymousId?: string;
  accountId?: string;
  sessionId?: string;
  contentId?: string;
  contentVersion?: number;
  locale?: "en" | "ur";
  consent: "granted" | "essential-only";
  releaseSha?: string;
  environment?: "local" | "test" | "staging" | "production";
}>;

const forbiddenKeys = new Set([
  "password",
  "passcode",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "sessionToken",
  "otp",
  "code",
  "secret",
  "secureHash",
  "integritySalt",
  "paymentSecret",
  "paymentPayload",
  "rawResponse",
  "challengeResponse",
  "email",
  "phone",
  "cnic",
  "address",
]);

const safeKeyPattern = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;

function inspectAnalyticsValue(value: unknown, path: string, depth: number): void {
  if (depth > 5) throw new Error(`Analytics property nesting is too deep: ${path}`);
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    if (value.length > 500) throw new Error(`Analytics string is too long: ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 50) throw new Error(`Analytics array is too large: ${path}`);
    for (const [index, entry] of value.entries()) {
      inspectAnalyticsValue(entry, `${path}[${index}]`, depth + 1);
    }
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length > 50) throw new Error(`Analytics object is too large: ${path}`);
    for (const [key, entry] of Object.entries(record)) {
      if (!safeKeyPattern.test(key)) throw new Error(`Invalid analytics property key: ${key}`);
      if (forbiddenKeys.has(key)) throw new Error(`Forbidden analytics property: ${key}`);
      inspectAnalyticsValue(entry, path ? `${path}.${key}` : key, depth + 1);
    }
    return;
  }
  throw new Error(`Unsupported analytics property type: ${path}`);
}

export function assertSafeAnalyticsProperties(properties: Record<string, unknown>): void {
  inspectAnalyticsValue(properties, "properties", 0);
}

export function isEssentialAnalyticsEvent(name: AnalyticsEventName): boolean {
  return (ESSENTIAL_ANALYTICS_EVENTS as readonly string[]).includes(name);
}
