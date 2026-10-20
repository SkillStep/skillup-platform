import { describe, expect, it, vi } from "vitest";

import {
  buildCampaignDailyLogsEmail,
  buildCampaignDailyLogsWordDocument,
  createCampaignDailyLogsEmailTask,
} from "./campaign-daily-logs-email.js";
import type { CampaignOpsDailyMetrics } from "./campaign-ops-daily-metrics.js";
import type { ApiConfig } from "./config.js";

const sampleOps: CampaignOpsDailyMetrics = {
  date: "2026-10-14",
  landingTraffic: 40,
  heTraffic: 25,
  nonHeTraffic: 10,
  untaggedNetworkTraffic: 5,
  jazzcashPaywallTraffic: 18,
  mpinCount: 12,
  successCount: 7,
  failureCount: 3,
  failureReasons: [
    { reason: "Wallet not found", count: 2 },
    { reason: "Timeout", count: 1 },
  ],
};

function baseConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    APP_ENV: "staging",
    API_HOST: "127.0.0.1",
    API_PORT: 3001,
    PUBLIC_APP_URL: "https://skillupshop.codistan.org",
    DATABASE_URL: "postgresql://skillup:skillup@127.0.0.1:5432/skillup",
    DATABASE_MAX_CONNECTIONS: 10,
    SESSION_COOKIE_NAME: "skillup_session",
    SESSION_SECRET: "test-session-secret-at-least-32-chars",
    SESSION_IDLE_MINUTES: 60,
    SESSION_ABSOLUTE_HOURS: 168,
    AUTH_CHALLENGE_MINUTES: 10,
    EMAIL_PROVIDER: "smtp",
    EMAIL_FROM: "no-reply@skillup.example",
    SMTP_HOST: "smtp.skillup.example",
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_REQUIRE_TLS: true,
    SMTP_USERNAME: "smtp-user",
    SMTP_PASSWORD: "smtp-pass",
    SMS_PROVIDER: "disabled",
    FEATURE_PREMIUM_ENABLED: true,
    FEATURE_PAYMENT_SERVICE_ENABLED: false,
    FEATURE_JAZZCASH_ENABLED: false,
    JAZZCASH_MODE: "disabled",
    JAZZCASH_VERSION: "1.1",
    JAZZCASH_TXN_TYPE: "MWALLET",
    JAZZCASH_BANK_ID: "",
    JAZZCASH_PRODUCT_ID: "",
    JAZZCASH_CHECKOUT_MINUTES: 15,
    PREMIUM_JAZZCASH_V11_CHECKOUT: false,
    PREMIUM_CHECKOUT_BYPASS: false,
    RELEASE_SHA: "test-sha",
    RELEASE_PIPELINE_ID: "test",
    RELEASE_ARTIFACT_REF: "test",
    RELEASE_IMAGE_DIGEST: "test",
    ROLLBACK_ARTIFACT_REF: "unknown",
    LOG_LEVEL: "silent",
    CAMPAIGN_DAILY_REPORT_TO: "m.abdullah73111@gmail.com",
    CAMPAIGN_DAILY_REPORT_HOUR_PKT: 6,
    ...overrides,
  } as ApiConfig;
}

describe("campaign daily Logs email content", () => {
  it("titles the message as Logs and includes funnel metrics", () => {
    const message = buildCampaignDailyLogsEmail(sampleOps, "2026-10-15");
    expect(message.subject).toContain("Logs");
    expect(message.subject).toContain("2026-10-15");
    expect(message.text).toContain("Traffic on landing page: 40");
    expect(message.text).toContain("HE traffic: 25");
    expect(message.text).toContain("NON HE traffic: 10");
    expect(message.text).toContain("Traffic on JazzCash paywall: 18");
    expect(message.text).toContain("MPIN count: 12");
    expect(message.text).toContain("Success count: 7");
    expect(message.text).toContain("Failure count: 3");
    expect(message.text).toContain("Wallet not found (2)");
    expect(message.html).toContain("SkillUp daily Logs");
    expect(message.html).not.toContain("Detailed view — Platform");
  });

  it("builds a Word document with the same Logs metrics", () => {
    const doc = buildCampaignDailyLogsWordDocument(sampleOps);
    expect(doc).toContain('progid="Word.Document"');
    expect(doc).toContain("SkillUp daily Logs");
    expect(doc).toContain("Traffic on landing page");
    expect(doc).toContain("40");
    expect(doc).toContain("HE traffic");
    expect(doc).toContain("MPIN count");
    expect(doc).toContain("Wallet not found");
    expect(doc).toContain("Failure reasons");
  });
});

describe("createCampaignDailyLogsEmailTask", () => {
  it("sends Logs email with Word attachment after 06:00 PKT", async () => {
    type MailPayload = Readonly<{
      to: string;
      subject: string;
      attachments?: readonly Readonly<{ filename: string; contentType: string }>[];
    }>;
    const sent: MailPayload[] = [];
    const sendMail = vi.fn(async (message: MailPayload) => {
      sent.push(message);
      return { messageId: "logs-1" };
    });
    const queries: unknown[][] = [];
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push([sql, params]);
        if (sql.includes("exists(")) {
          const already =
            queries.filter((entry) => String(entry[0]).includes("exists(")).length > 1;
          return { rows: [{ exists: already }] };
        }
        if (sql.includes("from commercial_events") && sql.includes("event_name in")) {
          return {
            rows: [
              { event_name: "paywall_viewed", count: "40" },
              { event_name: "add_to_cart", count: "18" },
            ],
          };
        }
        if (sql.includes("he_tag")) {
          return {
            rows: [
              { he_tag: "1", count: "25" },
              { he_tag: "0", count: "10" },
              { he_tag: null, count: "5" },
            ],
          };
        }
        if (sql.includes("from jazzcash_wallet_link_intents")) {
          return {
            rows: [
              { status: "completed", count: "12" },
              { status: "pending", count: "6" },
            ],
          };
        }
        if (sql.includes("from payment_orders") && sql.includes("status in")) {
          return {
            rows: [
              { status: "succeeded", count: "7" },
              { status: "failed", count: "3" },
            ],
          };
        }
        if (sql.includes("failure_message")) {
          return { rows: [{ reason: "Wallet not found", count: "2" }] };
        }
        if (sql.includes("insert into privileged_audit_events")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const before = createCampaignDailyLogsEmailTask({
      pool: pool as never,
      config: baseConfig(),
      mailer: { sendMail },
      now: () => new Date("2026-10-14T00:30:00.000Z"),
    });
    expect(await before()).toEqual({ status: "skipped_before_send_hour" });

    const afterSix = createCampaignDailyLogsEmailTask({
      pool: pool as never,
      config: baseConfig(),
      mailer: { sendMail },
      now: () => new Date("2026-10-14T01:05:00.000Z"),
    });
    expect(await afterSix()).toEqual({ status: "sent", reportDate: "2026-10-14" });
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sent[0]?.to).toBe("m.abdullah73111@gmail.com");
    expect(sent[0]?.subject).toContain("Logs");
    expect(sent[0]?.attachments?.[0]?.filename).toMatch(/skillup-daily-logs-.*\.doc$/);
    expect(sent[0]?.attachments?.[0]?.contentType).toContain("msword");

    expect(await afterSix()).toEqual({
      status: "skipped_already_sent",
      reportDate: "2026-10-14",
    });
  });
});
