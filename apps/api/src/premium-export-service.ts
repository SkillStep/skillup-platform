import { createHash, randomUUID } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { PoolClient } from "pg";

import type { AdminIdentity, AdminService } from "./admin.js";
import {
  PREMIUM_EXPORT_MAX_ROWS,
  PREMIUM_REPORT_SCHEMA_VERSION,
  type PremiumExportInput,
  type PremiumLedgerQuery,
  rowsToCsv,
} from "./premium-reporting-contract.js";
import type { PremiumQueryService } from "./premium-reporting-queries.js";

export type PremiumExportService = Readonly<{
  create: (
    actor: AdminIdentity,
    input: PremiumExportInput,
    correlationId: string,
  ) => Promise<Readonly<Record<string, unknown>>>;
  history: (limit: number) => Promise<Readonly<Record<string, unknown>>>;
  download: (
    exportId: string,
  ) => Promise<Readonly<{ filename: string; contentType: string; payload: Buffer }>>;
}>;

async function transaction<T>(
  pool: DatabaseClient["pool"],
  operation: (database: PoolClient) => Promise<T>,
): Promise<T> {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    const result = await operation(connection);
    await connection.query("commit");
    return result;
  } catch (error) {
    await connection.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

function reportItems(
  report: Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] {
  const items = report["items"];
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is Readonly<Record<string, unknown>> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

async function rowsForExport(
  queryService: PremiumQueryService,
  input: PremiumExportInput,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  if (input.reportType === "summary") {
    const report = await queryService.summary(input.filters);
    const summary = report["summary"];
    const summaryRow =
      typeof summary === "object" && summary !== null && !Array.isArray(summary)
        ? { section: "summary", ...(summary as Record<string, unknown>) }
        : { section: "summary" };
    const buckets = Array.isArray(report["buckets"])
      ? report["buckets"].filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null && !Array.isArray(item),
        )
      : [];
    return [summaryRow, ...buckets.map((bucket) => ({ section: "bucket", ...bucket }))];
  }

  const ledgerQuery: PremiumLedgerQuery = {
    ...input.filters,
    limit: PREMIUM_EXPORT_MAX_ROWS,
    offset: 0,
  };
  if (input.reportType === "payments") {
    return reportItems(await queryService.payments(ledgerQuery));
  }
  if (input.reportType === "memberships") {
    return reportItems(await queryService.memberships(ledgerQuery));
  }
  if (input.reportType === "recurring_customers") {
    return reportItems(await queryService.recurringCustomers(ledgerQuery));
  }
  return reportItems(await queryService.reconciliation(ledgerQuery));
}

export function createPremiumExportService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    adminService: AdminService;
    queryService: PremiumQueryService;
    now?: () => Date;
  }>,
): PremiumExportService {
  const now = options.now ?? (() => new Date());

  return {
    create: async (actor, input, correlationId) => {
      const rows = await rowsForExport(options.queryService, input);
      if (rows.length > PREMIUM_EXPORT_MAX_ROWS) {
        throw Object.assign(
          new Error(
            `The export exceeds ${PREMIUM_EXPORT_MAX_ROWS} rows. Narrow the date range or filters.`,
          ),
          { statusCode: 413 },
        );
      }
      const csv = rowsToCsv(rows);
      const payload = Buffer.from(csv, "utf8");
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + 86_400_000);
      const exportId = randomUUID();
      const contentDigest = createHash("sha256").update(payload).digest("hex");
      const filename = `skillup-premium-${input.reportType}-${createdAt.toISOString().slice(0, 10)}-${exportId.slice(0, 8)}.csv`;

      await transaction(options.pool, async (database) => {
        await database.query(
          `insert into admin_exports
            (id, requested_by, export_type, filters, reason, status, row_count,
             content_digest, schema_version, filename, content_type,
             created_at, completed_at, generated_at, expires_at)
           values ($1, $2, $3, $4::jsonb, $5, 'completed', $6, $7, $8, $9,
                   'text/csv; charset=utf-8', $10, $10, $10, $11)`,
          [
            exportId,
            actor.userId,
            input.reportType,
            JSON.stringify(input.filters),
            input.reason,
            rows.length,
            contentDigest,
            PREMIUM_REPORT_SCHEMA_VERSION,
            filename,
            createdAt,
            expiresAt,
          ],
        );
        await database.query(
          `insert into admin_export_payloads (export_id, payload, expires_at, created_at)
           values ($1, $2, $3, $4)`,
          [exportId, payload, expiresAt, createdAt],
        );
      });

      await options.adminService.audit({
        actorUserId: actor.userId,
        actorRole: actor.roles[0] ?? null,
        action: "premium.report.export",
        targetType: "admin_export",
        targetId: exportId,
        result: "succeeded",
        reason: input.reason,
        correlationId,
        metadata: {
          reportType: input.reportType,
          filters: input.filters,
          rowCount: rows.length,
          schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
          contentDigest,
        },
      });

      return {
        id: exportId,
        reportType: input.reportType,
        status: "completed",
        rowCount: rows.length,
        schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
        filename,
        contentType: "text/csv; charset=utf-8",
        contentDigest,
        generatedAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        downloadPath: `/v1/admin/reports/premium/exports/${exportId}/download`,
      };
    },

    history: async (limit) => {
      const safeLimit = Math.max(1, Math.min(limit, 100));
      const result = await options.pool.query<Record<string, unknown>>(
        `select e.id, e.export_type as "reportType", e.status,
                e.row_count as "rowCount", e.schema_version as "schemaVersion",
                e.filename, e.content_type as "contentType",
                e.content_digest as "contentDigest", e.created_at as "createdAt",
                e.generated_at as "generatedAt", e.expires_at as "expiresAt",
                substring(e.requested_by::text, 1, 8) || '…' || right(e.requested_by::text, 4) as "requestedBy"
           from admin_exports e
          where e.export_type in (
            'summary','payments','memberships','recurring_customers','reconciliation'
          )
          order by e.created_at desc
          limit $1`,
        [safeLimit],
      );
      return {
        reportSchemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
        exports: result.rows.map((row) => ({
          ...row,
          rowCount: asNumber(row["rowCount"]),
          createdAt: asIso(row["createdAt"]),
          generatedAt: asIso(row["generatedAt"]),
          expiresAt: asIso(row["expiresAt"]),
          downloadPath: `/v1/admin/reports/premium/exports/${String(row["id"])}/download`,
        })),
      };
    },

    download: async (exportId) => {
      const result = await options.pool.query<{
        filename: string;
        content_type: string;
        payload: Buffer;
        expires_at: Date;
      }>(
        `select e.filename, e.content_type, p.payload, p.expires_at
           from admin_exports e
           join admin_export_payloads p on p.export_id = e.id
          where e.id = $1 and e.status = 'completed'`,
        [exportId],
      );
      const row = result.rows[0];
      if (!row) {
        throw Object.assign(new Error("The report export was not found."), { statusCode: 404 });
      }
      if (row.expires_at <= now()) {
        throw Object.assign(new Error("The report export has expired. Generate it again."), {
          statusCode: 410,
        });
      }
      return {
        filename: row.filename,
        contentType: row.content_type,
        payload: row.payload,
      };
    },
  };
}
