import { z } from "zod";

import type { AdminIdentity } from "./admin.js";

export const PREMIUM_REPORT_SCHEMA_VERSION = "premium-report-v1";
export const PREMIUM_REPORT_TIMEZONE = "Asia/Karachi";
export const PREMIUM_EXPORT_MAX_ROWS = 5_000;
export const PREMIUM_REPORT_MAX_DAYS = 366;

export const PremiumPresetSchema = z.enum([
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "current_month",
  "previous_month",
  "custom",
]);

export const PremiumAggregationSchema = z.enum(["daily", "monthly"]);
export const PremiumPaymentPurposeSchema = z.enum(["activation", "renewal", "reactivation"]);
export const PremiumPaymentStatusSchema = z.enum([
  "created",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "refunded",
]);
export const PremiumMembershipStatusSchema = z.enum([
  "active",
  "grace",
  "expired",
  "cancelled",
  "refunded",
  "revoked",
]);

export const PremiumReportQuerySchema = z
  .object({
    preset: PremiumPresetSchema.default("last_30_days"),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    aggregation: PremiumAggregationSchema.default("daily"),
    planCode: z.string().trim().min(3).max(80).optional(),
    planVersionId: z.string().uuid().optional(),
    paymentPurpose: PremiumPaymentPurposeSchema.optional(),
    paymentStatus: PremiumPaymentStatusSchema.optional(),
    membershipStatus: PremiumMembershipStatusSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.preset === "custom" && (!value.from || !value.to)) {
      context.addIssue({
        code: "custom",
        message: "Custom reports require both from and to timestamps.",
      });
    }
    if (value.preset !== "custom" && (value.from || value.to)) {
      context.addIssue({
        code: "custom",
        message: "Explicit from/to timestamps are only accepted with the custom preset.",
      });
    }
  });

export const PremiumLedgerQuerySchema = PremiumReportQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  search: z.string().trim().min(3).max(120).optional(),
}).strict();

export const PremiumReconciliationQuerySchema = PremiumReportQuerySchema.extend({
  reconciliationStatus: z.enum(["open", "resolved", "ignored"]).optional(),
  mismatchKind: z
    .enum(["missing_internal", "missing_provider", "amount", "currency", "status", "entitlement", "duplicate"])
    .optional(),
  minimumAgeMinutes: z.coerce.number().int().min(0).max(525_600).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict();

export const PremiumExportInputSchema = z
  .object({
    reportType: z.enum(["summary", "payments", "memberships", "recurring_customers", "reconciliation"]),
    filters: PremiumReportQuerySchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const PremiumPlanVersionInputSchema = z
  .object({
    planCode: z.enum(["premium-monthly", "premium-yearly"]),
    amountMinor: z.number().int().min(1).max(100_000_000),
    currency: z.literal("PKR"),
    billingPeriod: z.enum(["month", "year"]),
    capabilities: z
      .array(z.string().regex(/^[a-z][a-z0-9_]{2,79}$/))
      .min(1)
      .max(50),
    termsVersion: z.string().trim().min(1).max(40),
    effectiveAt: z.iso.datetime().nullable().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const PremiumPlanTransitionSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    confirmation: z.literal("CONFIRM"),
  })
  .strict();

export type PremiumReportQuery = z.infer<typeof PremiumReportQuerySchema>;
export type PremiumLedgerQuery = z.infer<typeof PremiumLedgerQuerySchema>;
export type PremiumReconciliationQuery = z.infer<typeof PremiumReconciliationQuerySchema>;
export type PremiumExportInput = z.infer<typeof PremiumExportInputSchema>;
export type PremiumPlanVersionInput = z.infer<typeof PremiumPlanVersionInputSchema>;

export type PremiumReportRange = Readonly<{
  from: Date;
  to: Date;
  preset: z.infer<typeof PremiumPresetSchema>;
  aggregation: z.infer<typeof PremiumAggregationSchema>;
}>;

export type PremiumAccess = Readonly<{
  capabilities: readonly string[];
  canReadReports: boolean;
  canExportReports: boolean;
  canReadSubscriptions: boolean;
  canAdjustSubscriptions: boolean;
  canReadPlans: boolean;
  canManagePlans: boolean;
  canReconcilePayments: boolean;
}>;

const ROLE_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  analyst: ["premium.report.read", "subscription.read", "commercial.plan.read"],
  payment_operator: [
    "premium.report.read",
    "premium.report.export",
    "subscription.read",
    "subscription.adjust",
    "commercial.plan.read",
    "payment.read",
    "payment.reconcile",
    "entitlement.correct",
  ],
  security_admin: [
    "premium.report.read",
    "premium.report.export",
    "subscription.read",
    "subscription.adjust",
    "commercial.plan.read",
    "commercial.plan.manage",
  ],
};

export function premiumAccess(identity: AdminIdentity): PremiumAccess {
  const capabilities = new Set(identity.capabilities);
  for (const role of identity.roles) {
    for (const capability of ROLE_CAPABILITIES[role] ?? []) capabilities.add(capability);
  }
  const sorted = [...capabilities].sort();
  return {
    capabilities: sorted,
    canReadReports: capabilities.has("premium.report.read"),
    canExportReports: capabilities.has("premium.report.export"),
    canReadSubscriptions: capabilities.has("subscription.read"),
    canAdjustSubscriptions:
      capabilities.has("subscription.adjust") || capabilities.has("entitlement.correct"),
    canReadPlans: capabilities.has("commercial.plan.read"),
    canManagePlans: capabilities.has("commercial.plan.manage"),
    canReconcilePayments: capabilities.has("payment.reconcile"),
  };
}

function karachiParts(value: Date): Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: PREMIUM_REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts["year"] ?? value.getUTCFullYear(),
    month: parts["month"] ?? value.getUTCMonth() + 1,
    day: parts["day"] ?? value.getUTCDate(),
    hour: parts["hour"] ?? 0,
    minute: parts["minute"] ?? 0,
    second: parts["second"] ?? 0,
  };
}

function karachiDate(year: number, month: number, day: number, endExclusive = false): Date {
  const utcMilliseconds = Date.UTC(year, month - 1, day, endExclusive ? 24 : 0, 0, 0, 0);
  return new Date(utcMilliseconds - 5 * 60 * 60 * 1_000);
}

function addKarachiDays(value: Date, days: number): Date {
  const parts = karachiParts(value);
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return karachiDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

export function resolvePremiumReportRange(
  query: PremiumReportQuery,
  now: Date = new Date(),
): PremiumReportRange {
  if (query.preset === "custom") {
    const from = new Date(query.from ?? "");
    const to = new Date(query.to ?? "");
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
      throw Object.assign(new Error("The custom report range is invalid."), { statusCode: 400 });
    }
    if (to.getTime() - from.getTime() > PREMIUM_REPORT_MAX_DAYS * 86_400_000) {
      throw Object.assign(
        new Error(`Premium reports are limited to ${PREMIUM_REPORT_MAX_DAYS} days.`),
        { statusCode: 400 },
      );
    }
    return { from, to, preset: query.preset, aggregation: query.aggregation };
  }

  const current = karachiParts(now);
  const today = karachiDate(current.year, current.month, current.day);
  const tomorrow = addKarachiDays(today, 1);
  let from = today;
  let to = tomorrow;

  if (query.preset === "yesterday") {
    from = addKarachiDays(today, -1);
    to = today;
  } else if (query.preset === "last_7_days") {
    from = addKarachiDays(today, -6);
  } else if (query.preset === "last_30_days") {
    from = addKarachiDays(today, -29);
  } else if (query.preset === "current_month") {
    from = karachiDate(current.year, current.month, 1);
  } else if (query.preset === "previous_month") {
    const currentMonthStart = karachiDate(current.year, current.month, 1);
    const previousMonth = new Date(Date.UTC(current.year, current.month - 2, 1));
    from = karachiDate(previousMonth.getUTCFullYear(), previousMonth.getUTCMonth() + 1, 1);
    to = currentMonthStart;
  }

  return { from, to, preset: query.preset, aggregation: query.aggregation };
}

export function metricDefinitions(): Readonly<Record<string, string>> {
  return {
    grossCollections:
      "Completed capture effects whose authoritative occurred timestamp is inside the selected range.",
    refunds:
      "Completed refund or reversal effects whose authoritative occurred timestamp is inside the selected range.",
    netCollections: "Gross collections minus refunds for the selected range.",
    paymentSuccessRate:
      "Completed captures divided by terminal payment attempts. Pending and created attempts are excluded.",
    newPaidActivations:
      "First paid membership periods classified as activation. Audited manual grants are excluded.",
    successfulRenewals:
      "Completed paid membership periods classified and linked as renewals.",
    renewalSuccessRate:
      "Successful paid renewals divided by terminal renewal attempts.",
    recurringCustomers:
      "Distinct learners with at least one completed paid renewal. Auto-renew consent is not used.",
    mrr:
      "Normalized value of active paid membership periods at the report end: monthly price in full and yearly price divided by 12.",
    arr: "MRR multiplied by 12.",
    cashCollections:
      "Cash captured in the selected calendar period. This is separate from normalized recurring revenue.",
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv(rows: readonly Readonly<Record<string, unknown>>[]): string {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (headers.length === 0) return "report_generated_at\r\n";
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export function maskedUserReference(userId: string): string {
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}
