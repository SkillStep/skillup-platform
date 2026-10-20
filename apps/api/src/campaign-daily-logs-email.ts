import { randomUUID } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { Transporter } from "nodemailer";

import type { CampaignDailyReportMailer } from "./campaign-daily-report-email.js";
import {
  karachiCalendarDate,
  resolveCampaignDailyReportRecipient,
  shouldSendCampaignDailyReport,
} from "./campaign-daily-report-email.js";
import {
  type CampaignOpsDailyMetrics,
  loadCampaignOpsDailyMetrics,
} from "./campaign-ops-daily-metrics.js";
import type { ApiConfig } from "./config.js";
import { createSmtpTransport } from "./email-delivery.js";
import {
  PREMIUM_REPORT_TIMEZONE,
  PremiumReportQuerySchema,
  resolvePremiumReportRange,
} from "./premium-reporting-contract.js";

export const CAMPAIGN_DAILY_LOGS_EMAIL_ACTION = "campaign.daily_logs_email";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatOpsFailureReasons(ops: CampaignOpsDailyMetrics): string {
  if (ops.failureReasons.length === 0) return "(none)";
  return ops.failureReasons.map((row) => `${row.reason} (${row.count})`).join("; ");
}

function metricRows(
  ops: CampaignOpsDailyMetrics,
): readonly Readonly<{ label: string; value: string }>[] {
  return [
    { label: "Date", value: ops.date },
    { label: "Traffic on landing page", value: String(ops.landingTraffic) },
    { label: "HE traffic", value: String(ops.heTraffic) },
    { label: "NON HE traffic", value: String(ops.nonHeTraffic) },
    { label: "Traffic on JazzCash paywall", value: String(ops.jazzcashPaywallTraffic) },
    { label: "MPIN count", value: String(ops.mpinCount) },
    { label: "Success count", value: String(ops.successCount) },
    { label: "Failure count", value: String(ops.failureCount) },
  ];
}

/**
 * Word 2003 WordML document Excel/Word open as .doc — same lightweight approach as SpreadsheetML exports.
 */
export function buildCampaignDailyLogsWordDocument(ops: CampaignOpsDailyMetrics): string {
  const summaryRows = metricRows(ops)
    .map(
      (row) =>
        `<w:tr><w:tc><w:p><w:r><w:t>${escapeXml(row.label)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${escapeXml(row.value)}</w:t></w:r></w:p></w:tc></w:tr>`,
    )
    .join("");

  const failureRows =
    ops.failureReasons.length === 0
      ? `<w:tr><w:tc><w:p><w:r><w:t>(none)</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>0</w:t></w:r></w:p></w:tc></w:tr>`
      : ops.failureReasons
          .map(
            (row) =>
              `<w:tr><w:tc><w:p><w:r><w:t>${escapeXml(row.reason)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${row.count}</w:t></w:r></w:p></w:tc></w:tr>`,
          )
          .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml"
 xmlns:wx="http://schemas.microsoft.com/office/word/2003/auxHint"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xml:space="preserve">
 <o:DocumentProperties>
  <o:Title>SkillUp daily Logs — ${escapeXml(ops.date)}</o:Title>
 </o:DocumentProperties>
 <w:body>
  <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>SkillUp daily Logs</w:t></w:r></w:p>
  <w:p><w:r><w:t>Timezone: ${escapeXml(PREMIUM_REPORT_TIMEZONE)}</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Summary</w:t></w:r></w:p>
  <w:tbl>
   <w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>
   <w:tr>
    <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Metric</w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Value</w:t></w:r></w:p></w:tc>
   </w:tr>
   ${summaryRows}
  </w:tbl>
  <w:p><w:r><w:t></w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Failure reasons</w:t></w:r></w:p>
  <w:tbl>
   <w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>
   <w:tr>
    <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Reason</w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Count</w:t></w:r></w:p></w:tc>
   </w:tr>
   ${failureRows}
  </w:tbl>
 </w:body>
</w:wordDocument>
`;
}

export function buildCampaignDailyLogsEmail(
  ops: CampaignOpsDailyMetrics,
  reportDate: string,
): Readonly<{ subject: string; text: string; html: string; wordDocument: string }> {
  const subject = `SkillUp daily Logs — ${reportDate} (PKT)`;
  const rows = metricRows(ops);

  const text = [
    `SkillUp daily Logs (${PREMIUM_REPORT_TIMEZONE})`,
    `Send day (PKT): ${reportDate}`,
    "",
    ...rows.map((row) => `${row.label}: ${row.value}`),
    `Failure reasons: ${formatOpsFailureReasons(ops)}`,
    "",
    "Word document attached.",
  ].join("\n");

  const summaryRowsHtml = rows
    .map(
      (row) =>
        `<tr><th align='left'>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`,
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
    `<h1 style="font-size:20px">SkillUp daily Logs</h1>`,
    `<p>Send day (PKT): <strong>${escapeHtml(reportDate)}</strong><br/>Timezone: ${escapeHtml(PREMIUM_REPORT_TIMEZONE)}</p>`,
    "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'><tbody>",
    summaryRowsHtml,
    "</tbody></table>",
    '<h2 style="font-size:16px">Failure reasons</h2>',
    "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'><thead><tr><th>Reason</th><th>Count</th></tr></thead>",
    `<tbody>${failureRowsHtml}</tbody></table>`,
    "<p style='color:#64748b;font-size:12px'>Word document attached. Landing/paywall from commercial_events; MPIN from completed wallet-link intents; success/failure from payment_orders. HE/NON-HE requires <code>he</code> on landing URLs.</p>",
    "</div>",
  ].join("");

  return {
    subject,
    text,
    html,
    wordDocument: buildCampaignDailyLogsWordDocument(ops),
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
    [CAMPAIGN_DAILY_LOGS_EMAIL_ACTION, reportDate],
  );
  return Boolean(result.rows[0]?.exists);
}

async function recordSend(
  pool: DatabaseClient["pool"],
  input: Readonly<{
    reportDate: string;
    recipient: string;
    releaseSha: string;
    metrics: CampaignOpsDailyMetrics;
  }>,
): Promise<void> {
  await pool.query(
    `insert into privileged_audit_events (
       actor_user_id, actor_role, action, target_type, target_id, result,
       reason, correlation_id, release_sha, metadata
     ) values (
       null, 'maintenance', $1, 'campaign_logs', $2, 'succeeded',
       $3, $4, $5, $6::jsonb
     )`,
    [
      CAMPAIGN_DAILY_LOGS_EMAIL_ACTION,
      input.reportDate,
      "Daily campaign Logs emailed at/after 06:00 Asia/Karachi",
      randomUUID(),
      input.releaseSha,
      JSON.stringify({
        reportDate: input.reportDate,
        recipient: input.recipient,
        landingTraffic: input.metrics.landingTraffic,
        successCount: input.metrics.successCount,
        failureCount: input.metrics.failureCount,
        timezone: PREMIUM_REPORT_TIMEZONE,
      }),
    ],
  );
}

export function createCampaignDailyLogsEmailTask(
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
    const range = resolvePremiumReportRange(query, instant);
    const metricsDate = karachiCalendarDate(range.from);
    const ops = await loadCampaignOpsDailyMetrics(options.pool, {
      fromIso: range.from.toISOString(),
      toIso: range.to.toISOString(),
      reportDate: metricsDate,
    });
    const message = buildCampaignDailyLogsEmail(ops, reportDate);
    const from = options.config.EMAIL_FROM;
    if (!from) {
      throw new Error("EMAIL_FROM is required to send the campaign daily Logs email.");
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
          filename: `skillup-daily-logs-${metricsDate}.doc`,
          content: message.wordDocument,
          contentType: "application/msword; charset=utf-8",
        },
      ],
    });

    await recordSend(options.pool, {
      reportDate,
      recipient,
      releaseSha: options.config.RELEASE_SHA,
      metrics: ops,
    });

    return { status: "sent", reportDate };
  };
}
