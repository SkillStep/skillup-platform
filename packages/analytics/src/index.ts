export const ANALYTICS_EVENTS = [
  "public_page_viewed",
  "skill_viewed",
  "path_viewed",
  "registration_started",
  "registration_completed",
  "level_started",
  "level_completed",
  "pricing_viewed",
  "payment_started",
  "payment_verified",
  "premium_activated",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsEvent = Readonly<{
  name: AnalyticsEventName;
  occurredAt: string;
  anonymousId?: string;
  accountId?: string;
  contentId?: string;
  contentVersion?: number;
  locale?: "en" | "ur";
  consent: "granted" | "essential-only";
}>;

const forbiddenKeys = new Set([
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "otp",
  "paymentSecret",
  "rawResponse",
]);

export function assertSafeAnalyticsProperties(properties: Record<string, unknown>): void {
  for (const key of Object.keys(properties)) {
    if (forbiddenKeys.has(key)) {
      throw new Error(`Forbidden analytics property: ${key}`);
    }
  }
}
