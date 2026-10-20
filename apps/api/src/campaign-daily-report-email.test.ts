import { describe, expect, it, vi } from "vitest";

import {
  buildCampaignDailyReportEmail,
  createCampaignDailyReportEmailTask,
  karachiCalendarDate,
  resolveCampaignDailyReportRecipient,
  shouldSendCampaignDailyReport,
} from "./campaign-daily-report-email.js";
import type { ApiConfig } from "./config.js";
import type { CampaignAttributionReport } from "./premium-campaign-attribution-report.js";

const sampleReport: CampaignAttributionReport = {
  reportSchemaVersion: "premium-campaign-attribution.v1",
  timezone: "Asia/Karachi",
  effectiveRange: {
    from: "2026-10-13T19:00:00.000Z",
    to: "2026-10-14T19:00:00.000Z",
    preset: "yesterday",
  },
  aggregation: "daily",
  totals: { subscriptions: 3, amountMinor: 1797 },
  basic: [],
  detailed: {
    platformByParameter: [
      {
        date: "2026-10-14",
        platform: "T",
        parameter: "20percentoff",
        subscriptions: 2,
        amountMinor: 1198,
      },
    ],
    packageByParameter: [
      {
        date: "2026-10-14",
        package: "2",
        parameter: "20percentoff",
        subscriptions: 2,
        amountMinor: 1198,
      },
    ],
  },
  daily: [
    {
      date: "2026-10-14",
      subscriptions: 3,
      amountMinor: 1797,
      byPlatform: { T: 2, none: 1 },
      byPackage: { "2": 2, none: 1 },
      byParameter: { "20percentoff": 2, none: 1 },
    },
  ],
  exportRows: [],
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

describe("campaign daily report schedule (Asia/Karachi)", () => {
  it("detects Karachi calendar date and send window", () => {
    // 2026-10-14 00:30 UTC = 05:30 PKT → before 06:00
    const before = new Date("2026-10-14T00:30:00.000Z");
    expect(karachiCalendarDate(before)).toBe("2026-10-14");
    expect(shouldSendCampaignDailyReport(before, { hourPkt: 6 })).toBe(false);

    // 2026-10-14 01:00 UTC = 06:00 PKT
    const atSix = new Date("2026-10-14T01:00:00.000Z");
    expect(shouldSendCampaignDailyReport(atSix, { hourPkt: 6 })).toBe(true);

    // 2026-10-14 10:00 UTC = 15:00 PKT → still eligible for same-day catch-up
    const afternoon = new Date("2026-10-14T10:00:00.000Z");
    expect(shouldSendCampaignDailyReport(afternoon, { hourPkt: 6 })).toBe(true);
  });
});

describe("campaign daily report email content", () => {
  it("builds subject, tables and CSV for Daily + Detailed views", () => {
    const message = buildCampaignDailyReportEmail(sampleReport, "2026-10-15");
    expect(message.subject).toContain("2026-10-15");
    expect(message.text).toContain("Detailed view — Platform × Parameter");
    expect(message.text).toContain("T | 20percentoff | 2");
    expect(message.text).toContain("Traffic on landing page");
    expect(message.html).toContain("Ops funnel");
    expect(message.html).toContain("Daily report");
    expect(message.csv).toContain("platform_parameter");
    expect(message.csv).toContain("2026-10-14,platform_parameter,T,20percentoff,,2");
  });
});

describe("resolveCampaignDailyReportRecipient", () => {
  it("uses configured recipient and defaults on staging/production", () => {
    expect(resolveCampaignDailyReportRecipient(baseConfig())).toBe("m.abdullah73111@gmail.com");
    expect(
      resolveCampaignDailyReportRecipient(
        baseConfig({ CAMPAIGN_DAILY_REPORT_TO: undefined, APP_ENV: "staging" }),
      ),
    ).toBe("m.abdullah73111@gmail.com");
    expect(
      resolveCampaignDailyReportRecipient(
        baseConfig({ CAMPAIGN_DAILY_REPORT_TO: undefined, APP_ENV: "local" }),
      ),
    ).toBeNull();
  });
});

describe("createCampaignDailyReportEmailTask", () => {
  it("skips before send hour and when already sent; sends once after 06:00 PKT", async () => {
    type MailPayload = Readonly<{
      to: string;
      subject: string;
    }>;
    const sent: MailPayload[] = [];
    const sendMail = vi.fn(async (message: MailPayload) => {
      sent.push(message);
      return { messageId: "1" };
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
        if (sql.includes("from payment_orders")) {
          return {
            rows: [
              {
                date: "2026-10-14",
                platform: "T",
                package: "2",
                parameter: "20percentoff",
                subscriptions: 2,
                amountMinor: 1198,
              },
            ],
          };
        }
        if (sql.includes("insert into privileged_audit_events")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const task = createCampaignDailyReportEmailTask({
      pool: pool as never,
      config: baseConfig(),
      mailer: { sendMail },
      now: () => new Date("2026-10-14T00:30:00.000Z"),
    });
    expect(await task()).toEqual({ status: "skipped_before_send_hour" });
    expect(sendMail).not.toHaveBeenCalled();

    const afterSix = createCampaignDailyReportEmailTask({
      pool: pool as never,
      config: baseConfig(),
      mailer: { sendMail },
      now: () => new Date("2026-10-14T01:05:00.000Z"),
    });
    expect(await afterSix()).toEqual({ status: "sent", reportDate: "2026-10-14" });
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sent[0]?.to).toBe("m.abdullah73111@gmail.com");
    expect(sent[0]?.subject).toContain("2026-10-14");

    expect(await afterSix()).toEqual({
      status: "skipped_already_sent",
      reportDate: "2026-10-14",
    });
    expect(sendMail).toHaveBeenCalledOnce();
  });
});
