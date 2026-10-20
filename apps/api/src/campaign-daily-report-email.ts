import { randomUUID } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { Transporter } from "nodemailer";

import {
  type CampaignOpsDailyMetrics,
  emptyCampaignOpsDailyMetrics,
  loadCampaignOpsDailyMetrics,
} from "./campaign-ops-daily-metrics.js";
import type { ApiConfig } from "./config.js";
import { createSmtpTransport } from "./email-delivery.js";
import {
  type CampaignAttributionReport,
  loadCampaignAttributionReport,
} from "./premium-campaign-attribution-report.js";
import { PREMIUM_REPORT_TIMEZONE, PremiumReportQuerySchema } from "./premium-reporting-contract.js";

export const CAMPAIGN_DAILY_REPORT_EMAIL_ACTION = "campaign.daily_report_email";
const DEFAULT_RECIPIENT = "m.abdullah73111@gmail.com";

export type CampaignDailyReportMailer = Readonly<{
  sendMail: (
    message: Readonly<{
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
      attachments?: readonly Readonly<{
        filename: string;
        content: string;
        contentType: string;
      }>[];
    }>,
  ) => Promise<unknown>;
}>;

function karachiParts(now: Date): Readonly<{
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
}> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PREMIUM_REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/** YYYY-MM-DD in Asia/Karachi for the given instant. */
export function karachiCalendarDate(now: Date): string {
  const parts = karachiParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * True once the Karachi clock has reached the configured send hour today.
 * Catch-up after 06:00 is intentional so a brief API outage still delivers the same day.
 */
export function shouldSendCampaignDailyReport(
  now: Date,
  options: Readonly<{ hourPkt?: number }> = {},
): boolean {
  const hourPkt = options.hourPkt ?? 6;
  return karachiParts(now).hour >= hourPkt;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function label(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "none" || trimmed === "unknown") return "— (no UTM)";
  return trimmed;
}

function csvCell(value: string | number): string {
  const raw = String(value ?? "");
  if (/[",\n\r]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}

export function buildCampaignDailyReportCsv(report: CampaignAttributionReport): string {
  const lines = ["date,view,platform,parameter,package,count"];
  for (const row of report.detailed.platformByParameter) {
    lines.push(
      [
        csvCell(row.date),
        csvCell("platform_parameter"),
        csvCell(row.platform === "none" ? "" : row.platform),
        csvCell(row.parameter === "none" ? "" : row.parameter),
        csvCell(""),
        csvCell(row.subscriptions),
      ].join(","),
    );
  }
  for (const row of report.detailed.packageByParameter) {
    lines.push(
      [
        csvCell(row.date),
        csvCell("package_parameter"),
        csvCell(""),
        csvCell(row.parameter === "none" ? "" : row.parameter),
        csvCell(row.package === "none" ? "" : row.package),
        csvCell(row.subscriptions),
      ].join(","),
    );
  }
  for (const day of report.daily) {
    lines.push(
      [
        csvCell(day.date),
        csvCell("daily_total"),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(day.subscriptions),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function formatOpsFailureReasons(ops: CampaignOpsDailyMetrics): string {
  if (ops.failureReasons.length === 0) return "(none)";
  return ops.failureReasons.map((row) => `${row.reason} (${row.count})`).join("; ");
}

export function buildCampaignDailyReportEmail(
  report: CampaignAttributionReport,
  reportDate: string,
  ops: CampaignOpsDailyMetrics = emptyCampaignOpsDailyMetrics(reportDate),
): Readonly<{ subject: string; text: string; html: string; csv: string }> {
  const rangeLabel = `${report.effectiveRange.from.slice(0, 10)} → ${report.effectiveRange.to.slice(0, 10)}`;
  const subject = `SkillUp campaign daily report — ${reportDate} (PKT)`;

  const dailyLines = report.daily.map((row) => {
    const platforms = Object.entries(row.byPlatform)
      .map(([key, count]) => `${label(key)}=${count}`)
      .join(", ");
    const packages = Object.entries(row.byPackage)
      .map(([key, count]) => `${label(key)}=${count}`)
      .join(", ");
    const parameters = Object.entries(row.byParameter)
      .map(([key, count]) => `${label(key)}=${count}`)
      .join(", ");
    return `${row.date}: ${row.subscriptions} subs | platforms: ${platforms || "—"} | plans: ${packages || "—"} | params: ${parameters || "—"}`;
  });

  const detailedPlatformLines = report.detailed.platformByParameter.map(
    (row) =>
      `${row.date} | ${label(row.platform)} | ${label(row.parameter)} | ${row.subscriptions}`,
  );
  const detailedPackageLines = report.detailed.packageByParameter.map(
    (row) => `${row.date} | ${label(row.package)} | ${label(row.parameter)} | ${row.subscriptions}`,
  );

  const opsLines = [
    `Date: ${ops.date}`,
    `Traffic on landing page: ${ops.landingTraffic}`,
    `HE traffic: ${ops.heTraffic}`,
    `NON HE traffic: ${ops.nonHeTraffic}`,
    `Untagged network traffic: ${ops.untaggedNetworkTraffic}`,
    `Traffic on JazzCash paywall: ${ops.jazzcashPaywallTraffic}`,
    `MPIN count: ${ops.mpinCount}`,
    `Success count: ${ops.successCount}`,
    `Failure count: ${ops.failureCount}`,
    `Failure reasons: ${formatOpsFailureReasons(ops)}`,
  ];

  const text = [
    `SkillUp campaign daily detailed report (${PREMIUM_REPORT_TIMEZONE})`,
    `Send day (PKT): ${reportDate}`,
    `Range: ${rangeLabel}`,
    `Total subscriptions: ${report.totals.subscriptions}`,
    "",
    "Ops funnel (landing → JazzCash → payment)",
    ...opsLines,
    "",
    "Daily report",
    ...(dailyLines.length > 0 ? dailyLines : ["(no rows)"]),
    "",
    "Detailed view — Platform × Parameter",
    ...(detailedPlatformLines.length > 0 ? detailedPlatformLines : ["(no rows)"]),
    "",
    "Detailed view — Plan × Parameter",
    ...(detailedPackageLines.length > 0 ? detailedPackageLines : ["(no rows)"]),
    "",
    "CSV attached.",
  ].join("\n");

  const dailyRowsHtml =
    report.daily.length === 0
      ? "<tr><td colspan='2'>(no rows)</td></tr>"
      : report.daily
          .map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${row.subscriptions}</td></tr>`)
          .join("");

  const platformRowsHtml =
    report.detailed.platformByParameter.length === 0
      ? "<tr><td colspan='4'>(no rows)</td></tr>"
      : report.detailed.platformByParameter
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(label(row.platform))}</td><td>${escapeHtml(label(row.parameter))}</td><td>${row.subscriptions}</td></tr>`,
          )
          .join("");

  const packageRowsHtml =
    report.detailed.packageByParameter.length === 0
      ? "<tr><td colspan='4'>(no rows)</td></tr>"
      : report.detailed.packageByParameter
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(label(row.package))}</td><td>${escapeHtml(label(row.parameter))}</td><td>${row.subscriptions}</td></tr>`,
          )
          .join("");

  const failureRowsHtml =
    ops.failureReasons.length === 0
      ? "<tr><td colspan='2'>(none)</td></tr>"
      : ops.failureReasons
          .map((row) => `<tr><td>${escapeHtml(row.reason)}</td><td>${row.count}</td></tr>`)
          .join("");

  const html = [
    '<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:720px">',
    `<h1 style="font-size:20px">SkillUp campaign daily report</h1>`,
    `<p>Send day (PKT): <strong>${escapeHtml(reportDate)}</strong><br/>Range: ${escapeHtml(rangeLabel)}<br/>Total subscriptions: <strong>${report.totals.subscriptions}</strong></p>`,
    '<h2 style="font-size:16px">Ops funnel</h2>',
    "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'><tbody>",
    `<tr><th align='left'>Date</th><td>${escapeHtml(ops.date)}</td></tr>`,
    `<tr><th align='left'>Traffic on landing page</th><td>${ops.landingTraffic}</td></tr>`,
    `<tr><th align='left'>HE traffic</th><td>${ops.heTraffic}</td></tr>`,
    `<tr><th align='left'>NON HE traffic</th><td>${ops.nonHeTraffic}</td></tr>`,
    `<tr><th align='left'>Untagged network traffic</th><td>${ops.untaggedNetworkTraffic}</td></tr>`,
    `<tr><th align='left'>Traffic on JazzCash paywall</th><td>${ops.jazzcashPaywallTraffic}</td></tr>`,
    `<tr><th align='left'>MPIN count</th><td>${ops.mpinCount}</td></tr>`,
    `<tr><th align='left'>Success count</th><td>${ops.successCount}</td></tr>`,
    `<tr><th align='left'>Failure count</th><td>${ops.failureCount}</td></tr>`,
    "</tbody></table>",
    '<h3 style="font-size:14px">Failure reasons</h3>',
    "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'><thead><tr><th>Reason</th><th>Count</th></tr></thead>",
    `<tbody>${failureRowsHtml}</tbody></table>`,
    '<h2 style="font-size:16px">Daily report</h2>',
    "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'><thead><tr><th>Date</th><th>Subs</th></tr></thead>",
    `<tbody>${dailyRowsHtml}</tbody></table>`,
    '<h2 style="font-size:16px">Detailed view — Platform × Parameter</h2>',
    "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'><thead><tr><th>Date</th><th>Platform</th><th>Parameter</th><th>Total</th></tr></thead>",
    `<tbody>${platformRowsHtml}</tbody></table>`,
    '<h2 style="font-size:16px">Detailed view — Plan × Parameter</h2>',
    "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'><thead><tr><th>Date</th><th>Plan ID</th><th>Parameter</th><th>Total</th></tr></thead>",
    `<tbody>${packageRowsHtml}</tbody></table>`,
    "<p style='color:#64748b;font-size:12px'>CSV attached. Subs source of truth: succeeded payment attribution. Ops funnel uses commercial_events + wallet-link intents + payment_orders. HE/NON-HE requires <code>he</code> on landing URLs.</p>",
    "</div>",
  ].join("");

  return {
    subject,
    text,
    html,
    csv: buildCampaignDailyReportCsv(report),
  };
}

async function alreadySentForDate(
  pool: DatabaseClient["pool"],
  reportDate: string,
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `select exists(
       select 1
         from privileged_audit_events
        where action = $1
          and result = 'succeeded'
          and metadata->>'reportDate' = $2
     ) as exists`,
    [CAMPAIGN_DAILY_REPORT_EMAIL_ACTION, reportDate],
  );
  return Boolean(result.rows[0]?.exists);
}

async function recordSend(
  pool: DatabaseClient["pool"],
  input: Readonly<{
    reportDate: string;
    recipient: string;
    releaseSha: string;
    subscriptions: number;
  }>,
): Promise<void> {
  await pool.query(
    `insert into privileged_audit_events (
       actor_user_id, actor_role, action, target_type, target_id, result,
       reason, correlation_id, release_sha, metadata
     ) values (
       null, 'maintenance', $1, 'campaign_report', $2, 'succeeded',
       $3, $4, $5, $6::jsonb
     )`,
    [
      CAMPAIGN_DAILY_REPORT_EMAIL_ACTION,
      input.reportDate,
      "Daily campaign detailed report emailed at/after 06:00 Asia/Karachi",
      randomUUID(),
      input.releaseSha,
      JSON.stringify({
        reportDate: input.reportDate,
        recipient: input.recipient,
        subscriptions: input.subscriptions,
        timezone: PREMIUM_REPORT_TIMEZONE,
      }),
    ],
  );
}

export function resolveCampaignDailyReportRecipient(config: ApiConfig): string | null {
  const configured = config.CAMPAIGN_DAILY_REPORT_TO?.trim();
  if (configured) return configured.toLocaleLowerCase("en-US");
  if (config.APP_ENV === "staging" || config.APP_ENV === "production") {
    return DEFAULT_RECIPIENT;
  }
  return null;
}

export function createCampaignDailyReportEmailTask(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    config: ApiConfig;
    mailer?: CampaignDailyReportMailer;
    now?: () => Date;
  }>,
): () => Promise<Readonly<{ status: string; reportDate?: string }>> {
  const now = options.now ?? (() => new Date());
  const hourPkt = options.config.CAMPAIGN_DAILY_REPORT_HOUR_PKT ?? 6;

  return async () => {
    const recipient = resolveCampaignDailyReportRecipient(options.config);
    if (!recipient) {
      return { status: "skipped_no_recipient" };
    }
    if (options.config.EMAIL_PROVIDER !== "smtp") {
      return { status: "skipped_email_disabled" };
    }

    const instant = now();
    if (!shouldSendCampaignDailyReport(instant, { hourPkt })) {
      return { status: "skipped_before_send_hour" };
    }

    const reportDate = karachiCalendarDate(instant);
    if (await alreadySentForDate(options.pool, reportDate)) {
      return { status: "skipped_already_sent", reportDate };
    }

    const query = PremiumReportQuerySchema.parse({
      preset: "yesterday",
      aggregation: "daily",
    });
    const report = await loadCampaignAttributionReport(options.pool, query, instant);
    const opsDate = report.daily[0]?.date ?? report.effectiveRange.from.slice(0, 10) ?? reportDate;
    const ops = await loadCampaignOpsDailyMetrics(options.pool, {
      fromIso: report.effectiveRange.from,
      toIso: report.effectiveRange.to,
      reportDate: opsDate,
    });
    const message = buildCampaignDailyReportEmail(report, reportDate, ops);
    const from = options.config.EMAIL_FROM;
    if (!from) {
      throw new Error("EMAIL_FROM is required to send the campaign daily report.");
    }

    const mailer: CampaignDailyReportMailer =
      options.mailer ??
      ({
        sendMail: (payload) =>
          (createSmtpTransport(options.config) as Transporter).sendMail({
            ...payload,
            attachments: payload.attachments?.map((attachment) => ({ ...attachment })),
          }),
      } satisfies CampaignDailyReportMailer);

    await mailer.sendMail({
      from,
      to: recipient,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: [
        {
          filename: `skillup-campaign-daily-${reportDate}.csv`,
          content: message.csv,
          contentType: "text/csv; charset=utf-8",
        },
      ],
    });

    await recordSend(options.pool, {
      reportDate,
      recipient,
      releaseSha: options.config.RELEASE_SHA,
      subscriptions: report.totals.subscriptions,
    });

    return { status: "sent", reportDate };
  };
}
