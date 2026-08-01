import { createHash, randomUUID } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

import type { AdminIdentity, AdminService } from "./admin.js";
import type { AuthService, AuthenticatedLearner } from "./auth.js";
import type { ApiConfig } from "./config.js";
import {
  RequestAuthorizationError,
  requireAuthenticatedLearner,
  requireTrustedRequestOrigin,
} from "./request-auth.js";

const KindSchema = z.enum(["guide", "question", "glossary", "comparison"]);
const LocaleSchema = z.enum(["en", "ur"]);
const ContentStatusSchema = z.enum([
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "superseded",
  "archived",
]);

const ContentInputSchema = z
  .object({
    kind: KindSchema,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    locale: LocaleSchema.default("en"),
    title: z.string().trim().min(3).max(160),
    summary: z.string().trim().min(10).max(1000),
    directAnswer: z.string().trim().min(10).max(2000).nullable().optional(),
    body: z.record(z.string(), z.unknown()),
    sourceReferences: z
      .array(
        z
          .object({
            title: z.string().trim().min(3).max(300),
            publisher: z.string().trim().min(2).max(200).optional(),
            url: z.string().url().startsWith("https://").optional(),
            locator: z.string().trim().min(1).max(300).optional(),
            retrievedAt: z.iso.datetime().optional(),
          })
          .strict(),
      )
      .max(30),
  })
  .strict()
  .superRefine((value, context) => {
    if (Buffer.byteLength(JSON.stringify(value.body), "utf8") > 100_000) {
      context.addIssue({ code: "custom", path: ["body"], message: "Content body exceeds 100 KB." });
    }
  });

const ContentPatchSchema = ContentInputSchema.omit({ kind: true, slug: true, locale: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one content field is required.");

const PublicListQuerySchema = z.object({
  kind: KindSchema.optional(),
  locale: LocaleSchema.default("en"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

const AdminListQuerySchema = z.object({
  kind: KindSchema.optional(),
  locale: LocaleSchema.optional(),
  status: ContentStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

const PublicParamsSchema = z.object({ kind: KindSchema, slug: z.string().min(1).max(120) });
const IdParamsSchema = z.object({ id: z.string().uuid() });
const UserParamsSchema = z.object({ userId: z.string().uuid() });

const ReportInputSchema = z
  .object({
    targetType: z.enum([
      "public_content",
      "skill",
      "level",
      "achievement_share",
      "leaderboard_alias",
    ]),
    targetId: z.string().trim().min(1).max(200),
    category: z.enum(["incorrect", "unsafe", "outdated", "privacy", "abuse", "copyright", "other"]),
    description: z.string().trim().min(10).max(2000),
  })
  .strict();

const ResolveReportSchema = z
  .object({
    disposition: z.enum(["resolved", "dismissed"]),
    action: z.enum(["resolve", "dismiss", "suspend", "restore", "archive", "correct"]),
    reason: z.string().trim().min(3).max(1000),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

const RoleAssignmentSchema = z
  .object({
    role: z.enum([
      "content_editor",
      "content_reviewer",
      "publisher",
      "learner_support",
      "payment_operator",
      "analyst",
      "security_admin",
    ]),
    reason: z.string().trim().min(3).max(500),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict();

const ExportInputSchema = z
  .object({
    exportType: z.enum(["analytics", "payments", "content", "support", "audit"]),
    filters: z.record(z.string(), z.unknown()).default({}),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

const AuditQuerySchema = z.object({
  action: z.string().trim().min(1).max(160).optional(),
  actorUserId: z.string().uuid().optional(),
  result: z.enum(["allowed", "denied", "succeeded", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(20_000).default(0),
});

type ContentRow = Readonly<{
  id: string;
  kind: string;
  slug: string;
  locale: string;
  title: string;
  summary: string;
  direct_answer: string | null;
  body: Record<string, unknown>;
  source_references: readonly Record<string, unknown>[];
  author_name: string;
  reviewer_name: string;
  status: string;
  version: number;
  published_at: Date | null;
  reviewed_at: Date | null;
  freshness_review_at: Date | null;
  created_at: Date;
  updated_at: Date;
}>;

export class ContentOperationsError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ContentOperationsError";
    this.statusCode = statusCode;
  }
}

function publicView(row: ContentRow): Readonly<Record<string, unknown>> {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    summary: row.summary,
    directAnswer: row.direct_answer,
    body: row.body,
    sourceReferences: row.source_references,
    authorName: row.author_name,
    reviewerName: row.reviewer_name,
    version: row.version,
    publishedAt: row.published_at?.toISOString() ?? null,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    freshnessReviewAt: row.freshness_review_at?.toISOString() ?? null,
  };
}

function adminView(row: ContentRow): Readonly<Record<string, unknown>> {
  return {
    ...publicView(row),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
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

async function optionalLearner(
  request: FastifyRequest,
  config: ApiConfig,
  authService: AuthService,
): Promise<AuthenticatedLearner | null> {
  const token = parseCookie(request.headers.cookie, config.SESSION_COOKIE_NAME);
  return token ? authService.resolveSession(token) : null;
}

async function transaction<T>(
  pool: DatabaseClient["pool"],
  operation: (database: PoolClient) => Promise<T>,
): Promise<T> {
  const database = await pool.connect();
  try {
    await database.query("begin");
    const result = await operation(database);
    await database.query("commit");
    return result;
  } catch (error) {
    await database.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    database.release();
  }
}

function hasAnyRole(admin: AdminIdentity, allowed: readonly string[]): boolean {
  return admin.roles.some((role) => allowed.includes(role));
}

async function requireAdminRoles(
  request: FastifyRequest,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    adminService: AdminService;
  }>,
  allowedRoles: readonly string[],
): Promise<Readonly<{ learner: AuthenticatedLearner; admin: AdminIdentity }>> {
  const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
  const admin = await options.adminService.resolveIdentity(learner.id);
  if (!admin || !hasAnyRole(admin, allowedRoles)) {
    await options.adminService.audit({
      actorUserId: learner.id,
      action: "admin.role.required",
      targetType: "admin_route",
      targetId: request.routeOptions.url ?? request.url,
      result: "denied",
      reason: `Required roles: ${allowedRoles.join(", ")}`,
      correlationId: request.id,
    });
    throw new RequestAuthorizationError(403, "Administrative access is not allowed.");
  }
  return { learner, admin };
}

async function loadForUpdate(database: PoolClient, id: string): Promise<ContentRow> {
  const selected = await database.query<ContentRow>(
    `select * from public_content_entries where id = $1 for update`,
    [id],
  );
  const row = selected.rows[0];
  if (!row) throw new ContentOperationsError(404, "The content entry was not found.");
  return row;
}

export type ContentOperationsService = Readonly<{
  listPublic: (
    query: z.infer<typeof PublicListQuerySchema>,
  ) => Promise<readonly Record<string, unknown>[]>;
  getPublic: (kind: string, slug: string, locale: string) => Promise<Record<string, unknown>>;
  listAdmin: (
    query: z.infer<typeof AdminListQuerySchema>,
  ) => Promise<readonly Record<string, unknown>[]>;
  create: (
    actor: AdminIdentity,
    input: z.infer<typeof ContentInputSchema>,
  ) => Promise<Record<string, unknown>>;
  patch: (
    actor: AdminIdentity,
    id: string,
    patch: z.infer<typeof ContentPatchSchema>,
  ) => Promise<Record<string, unknown>>;
  transition: (
    actor: AdminIdentity,
    id: string,
    action: "submit" | "approve" | "publish" | "archive",
  ) => Promise<Record<string, unknown>>;
  schedule: (actor: AdminIdentity, id: string, publishAt: Date) => Promise<Record<string, unknown>>;
  processScheduled: (limit?: number) => Promise<number>;
  report: (
    reporterUserId: string | null,
    input: z.infer<typeof ReportInputSchema>,
  ) => Promise<{ id: string; status: string }>;
  listReports: (status: string, limit: number) => Promise<readonly Record<string, unknown>[]>;
  resolveReport: (
    actor: AdminIdentity,
    id: string,
    input: z.infer<typeof ResolveReportSchema>,
  ) => Promise<Record<string, unknown>>;
  assignRole: (
    actor: AdminIdentity,
    userId: string,
    input: z.infer<typeof RoleAssignmentSchema>,
    correlationId: string,
  ) => Promise<Record<string, unknown>>;
  revokeRole: (
    actor: AdminIdentity,
    userId: string,
    role: string,
    reason: string,
    correlationId: string,
  ) => Promise<Record<string, unknown>>;
  auditEvents: (
    query: z.infer<typeof AuditQuerySchema>,
  ) => Promise<readonly Record<string, unknown>[]>;
  createExport: (
    actor: AdminIdentity,
    input: z.infer<typeof ExportInputSchema>,
  ) => Promise<Record<string, unknown>>;
}>;

export function createContentOperationsService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    adminService: AdminService;
    releaseSha: string;
    now?: () => Date;
  }>,
): ContentOperationsService {
  const now = options.now ?? (() => new Date());

  return {
    listPublic: async (query) => {
      const result = await options.pool.query<ContentRow>(
        `select *
           from public_content_entries
          where status = 'published'
            and published_at <= $1
            and ($2::text is null or kind = $2)
            and locale = $3
          order by published_at desc, title
          limit $4 offset $5`,
        [now(), query.kind ?? null, query.locale, query.limit, query.offset],
      );
      return result.rows.map(publicView);
    },

    getPublic: async (kind, slug, locale) => {
      const result = await options.pool.query<ContentRow>(
        `select *
           from public_content_entries
          where kind = $1 and slug = $2 and locale = $3
            and status = 'published' and published_at <= $4
          order by version desc
          limit 1`,
        [kind, slug, locale, now()],
      );
      const row = result.rows[0];
      if (!row) throw new ContentOperationsError(404, "The public content entry was not found.");
      return publicView(row);
    },

    listAdmin: async (query) => {
      const result = await options.pool.query<ContentRow>(
        `select *
           from public_content_entries
          where ($1::text is null or kind = $1)
            and ($2::text is null or locale = $2)
            and ($3::text is null or status = $3)
          order by updated_at desc
          limit $4 offset $5`,
        [query.kind ?? null, query.locale ?? null, query.status ?? null, query.limit, query.offset],
      );
      return result.rows.map(adminView);
    },

    create: async (actor, input) => {
      const result = await options.pool.query<ContentRow>(
        `insert into public_content_entries
          (kind, slug, locale, title, summary, direct_answer, body, source_references,
           author_name, reviewer_name, status, version, freshness_review_at, created_at, updated_at)
         values (
           $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb,
           $9, 'Pending review', 'draft',
           coalesce((select max(version) + 1 from public_content_entries where kind = $1 and slug = $2 and locale = $3), 1),
           $10, $11, $11
         )
         returning *`,
        [
          input.kind,
          input.slug,
          input.locale,
          input.title,
          input.summary,
          input.directAnswer ?? null,
          JSON.stringify(input.body),
          JSON.stringify(input.sourceReferences),
          `actor:${actor.userId}`,
          new Date(now().getTime() + 180 * 86_400_000),
          now(),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new ContentOperationsError(500, "The content entry could not be created.");
      return adminView(row);
    },

    patch: async (actor, id, patch) =>
      transaction(options.pool, async (database) => {
        const existing = await loadForUpdate(database, id);
        if (!hasAnyRole(actor, ["content_editor"])) {
          throw new ContentOperationsError(403, "Only content editors may change draft content.");
        }
        if (!["draft", "in_review"].includes(existing.status)) {
          throw new ContentOperationsError(
            409,
            "Published or approved content must be versioned, not edited in place.",
          );
        }
        const result = await database.query<ContentRow>(
          `update public_content_entries
              set title = $2,
                  summary = $3,
                  direct_answer = $4,
                  body = $5::jsonb,
                  source_references = $6::jsonb,
                  author_name = $7,
                  status = 'draft',
                  reviewed_at = null,
                  updated_at = $8
            where id = $1
            returning *`,
          [
            id,
            patch.title ?? existing.title,
            patch.summary ?? existing.summary,
            patch.directAnswer === undefined ? existing.direct_answer : patch.directAnswer,
            JSON.stringify(patch.body ?? existing.body),
            JSON.stringify(patch.sourceReferences ?? existing.source_references),
            `actor:${actor.userId}`,
            now(),
          ],
        );
        return adminView(result.rows[0] ?? existing);
      }),

    transition: async (actor, id, action) =>
      transaction(options.pool, async (database) => {
        const existing = await loadForUpdate(database, id);
        const changedAt = now();
        if (action === "submit") {
          if (!hasAnyRole(actor, ["content_editor"]) || existing.status !== "draft") {
            throw new ContentOperationsError(409, "Only a draft may be submitted by an editor.");
          }
          const result = await database.query<ContentRow>(
            `update public_content_entries set status = 'in_review', updated_at = $2 where id = $1 returning *`,
            [id, changedAt],
          );
          return adminView(result.rows[0] ?? existing);
        }
        if (action === "approve") {
          if (!hasAnyRole(actor, ["content_reviewer"]) || existing.status !== "in_review") {
            throw new ContentOperationsError(
              409,
              "Only in-review content may be approved by a reviewer.",
            );
          }
          if (existing.source_references.length === 0) {
            throw new ContentOperationsError(
              409,
              "Reviewed public content requires at least one source reference.",
            );
          }
          const result = await database.query<ContentRow>(
            `update public_content_entries
                set status = 'approved', reviewer_name = $2, reviewed_at = $3, updated_at = $3
              where id = $1 returning *`,
            [id, `actor:${actor.userId}`, changedAt],
          );
          return adminView(result.rows[0] ?? existing);
        }
        if (action === "publish") {
          if (
            !hasAnyRole(actor, ["publisher"]) ||
            !["approved", "scheduled"].includes(existing.status)
          ) {
            throw new ContentOperationsError(
              409,
              "Only approved or scheduled content may be published.",
            );
          }
          await database.query(
            `update public_content_entries
                set status = 'superseded', updated_at = $4
              where kind = $1 and slug = $2 and locale = $3
                and status = 'published' and id <> $5`,
            [existing.kind, existing.slug, existing.locale, changedAt, id],
          );
          const result = await database.query<ContentRow>(
            `update public_content_entries
                set status = 'published', published_at = $2, updated_at = $2
              where id = $1 returning *`,
            [id, changedAt],
          );
          return adminView(result.rows[0] ?? existing);
        }
        if (!hasAnyRole(actor, ["publisher"])) {
          throw new ContentOperationsError(403, "Only publishers may archive content.");
        }
        const result = await database.query<ContentRow>(
          `update public_content_entries set status = 'archived', updated_at = $2 where id = $1 returning *`,
          [id, changedAt],
        );
        return adminView(result.rows[0] ?? existing);
      }),

    schedule: async (actor, id, publishAt) => {
      if (!hasAnyRole(actor, ["publisher"])) {
        throw new ContentOperationsError(403, "Only publishers may schedule content.");
      }
      if (publishAt.getTime() <= now().getTime()) {
        throw new ContentOperationsError(
          400,
          "A scheduled publication time must be in the future.",
        );
      }
      const result = await options.pool.query<ContentRow>(
        `update public_content_entries
            set status = 'scheduled', published_at = $2, updated_at = $3
          where id = $1 and status = 'approved'
          returning *`,
        [id, publishAt, now()],
      );
      const row = result.rows[0];
      if (!row) throw new ContentOperationsError(409, "Only approved content may be scheduled.");
      return adminView(row);
    },

    processScheduled: async (limit = 50) =>
      transaction(options.pool, async (database) => {
        const due = await database.query<ContentRow>(
          `select * from public_content_entries
            where status = 'scheduled' and published_at <= $1
            order by published_at
            limit $2
            for update skip locked`,
          [now(), Math.max(1, Math.min(limit, 100))],
        );
        for (const row of due.rows) {
          await database.query(
            `update public_content_entries
                set status = 'superseded', updated_at = $4
              where kind = $1 and slug = $2 and locale = $3
                and status = 'published' and id <> $5`,
            [row.kind, row.slug, row.locale, now(), row.id],
          );
          await database.query(
            `update public_content_entries set status = 'published', updated_at = $2 where id = $1`,
            [row.id, now()],
          );
        }
        return due.rows.length;
      }),

    report: async (reporterUserId, input) => {
      const result = await options.pool.query<{ id: string; status: string }>(
        `insert into content_reports
          (reporter_user_id, target_type, target_id, category, description, status)
         values ($1, $2, $3, $4, $5, 'open')
         returning id, status`,
        [reporterUserId, input.targetType, input.targetId, input.category, input.description],
      );
      const row = result.rows[0];
      if (!row) throw new ContentOperationsError(500, "The report could not be created.");
      return row;
    },

    listReports: async (status, limit) => {
      const result = await options.pool.query<Record<string, unknown>>(
        `select id, target_type as "targetType", target_id as "targetId", category,
                description, status, assigned_to as "assignedTo", created_at as "createdAt",
                resolved_at as "resolvedAt", resolution
           from content_reports
          where status = $1
          order by created_at
          limit $2`,
        [status, Math.max(1, Math.min(limit, 100))],
      );
      return result.rows;
    },

    resolveReport: async (actor, id, input) =>
      transaction(options.pool, async (database) => {
        const selected = await database.query<{
          id: string;
          target_type: string;
          target_id: string;
        }>(`select id, target_type, target_id from content_reports where id = $1 for update`, [id]);
        const report = selected.rows[0];
        if (!report) throw new ContentOperationsError(404, "The report was not found.");
        await database.query(
          `insert into moderation_actions
            (report_id, actor_user_id, action, target_type, target_id, reason, metadata)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            id,
            actor.userId,
            input.action,
            report.target_type,
            report.target_id,
            input.reason,
            JSON.stringify(input.metadata),
          ],
        );
        const result = await database.query<Record<string, unknown>>(
          `update content_reports
              set status = $2, assigned_to = $3, resolved_at = $4, resolution = $5
            where id = $1
            returning id, status, resolved_at as "resolvedAt", resolution`,
          [id, input.disposition, actor.userId, now(), input.reason],
        );
        return result.rows[0] ?? { id, status: input.disposition };
      }),

    assignRole: async (actor, userId, input, correlationId) =>
      transaction(options.pool, async (database) => {
        const changedAt = now();
        await database.query(
          `insert into admin_principals (user_id, status, created_at, updated_at)
           values ($1, 'active', $2, $2)
           on conflict (user_id) do update set status = 'active', updated_at = excluded.updated_at`,
          [userId, changedAt],
        );
        const result = await database.query<Record<string, unknown>>(
          `insert into admin_role_assignments
            (user_id, role, granted_by, reason, granted_at, expires_at)
           values ($1, $2, $3, $4, $5, $6)
           returning user_id as "userId", role, granted_at as "grantedAt", expires_at as "expiresAt"`,
          [
            userId,
            input.role,
            actor.userId,
            input.reason,
            changedAt,
            input.expiresAt ? new Date(input.expiresAt) : null,
          ],
        );
        await options.adminService.audit({
          actorUserId: actor.userId,
          actorRole: actor.roles[0] ?? null,
          action: "admin.role.grant",
          targetType: "admin_principal",
          targetId: userId,
          result: "succeeded",
          reason: input.reason,
          correlationId,
          metadata: { role: input.role, expiresAt: input.expiresAt ?? null },
        });
        return result.rows[0] ?? { userId, role: input.role };
      }),

    revokeRole: async (actor, userId, role, reason, correlationId) => {
      const result = await options.pool.query<Record<string, unknown>>(
        `update admin_role_assignments
            set revoked_at = $4, revoked_by = $3, revocation_reason = $5
          where user_id = $1 and role = $2 and revoked_at is null
          returning user_id as "userId", role, revoked_at as "revokedAt"`,
        [userId, role, actor.userId, now(), reason],
      );
      if (result.rowCount === 0)
        throw new ContentOperationsError(404, "The active role assignment was not found.");
      await options.adminService.audit({
        actorUserId: actor.userId,
        actorRole: actor.roles[0] ?? null,
        action: "admin.role.revoke",
        targetType: "admin_principal",
        targetId: userId,
        result: "succeeded",
        reason,
        correlationId,
        metadata: { role },
      });
      return result.rows[0] ?? { userId, role };
    },

    auditEvents: async (query) => {
      const result = await options.pool.query<Record<string, unknown>>(
        `select id, actor_user_id as "actorUserId", actor_role as "actorRole", action,
                target_type as "targetType", target_id as "targetId", result, reason,
                correlation_id as "correlationId", release_sha as "releaseSha",
                metadata, created_at as "createdAt"
           from privileged_audit_events
          where ($1::text is null or action = $1)
            and ($2::uuid is null or actor_user_id = $2)
            and ($3::text is null or result = $3)
          order by created_at desc
          limit $4 offset $5`,
        [
          query.action ?? null,
          query.actorUserId ?? null,
          query.result ?? null,
          query.limit,
          query.offset,
        ],
      );
      return result.rows;
    },

    createExport: async (actor, input) => {
      const createdAt = now();
      const exportId = randomUUID();
      const digest = createHash("sha256")
        .update(
          JSON.stringify({
            exportId,
            type: input.exportType,
            filters: input.filters,
            createdAt: createdAt.toISOString(),
          }),
        )
        .digest("hex");
      await options.pool.query(
        `insert into admin_exports
          (id, requested_by, export_type, filters, reason, status, row_count,
           content_digest, created_at, completed_at, expires_at)
         values ($1, $2, $3, $4::jsonb, $5, 'completed', 0, $6, $7, $7, $8)`,
        [
          exportId,
          actor.userId,
          input.exportType,
          JSON.stringify(input.filters),
          input.reason,
          digest,
          createdAt,
          new Date(createdAt.getTime() + 86_400_000),
        ],
      );
      return {
        id: exportId,
        exportType: input.exportType,
        status: "completed",
        rowCount: 0,
        contentDigest: digest,
        expiresAt: new Date(createdAt.getTime() + 86_400_000).toISOString(),
        note: "The export manifest is ready. Data rows remain server-side until an approved secure delivery adapter is configured.",
      };
    },
  };
}

export function registerContentOperationsRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    adminService: AdminService;
    contentService: ContentOperationsService;
  }>,
): void {
  app.get("/v1/public/content", async (request) => {
    const query = PublicListQuerySchema.parse(request.query);
    return { entries: await options.contentService.listPublic(query) };
  });

  app.get("/v1/public/content/:kind/:slug", async (request) => {
    const params = PublicParamsSchema.parse(request.params);
    const query = z.object({ locale: LocaleSchema.default("en") }).parse(request.query);
    return {
      entry: await options.contentService.getPublic(params.kind, params.slug, query.locale),
    };
  });

  app.post("/v1/public/content/reports", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const learner = await optionalLearner(request, options.config, options.authService);
    const report = await options.contentService.report(
      learner?.id ?? null,
      ReportInputSchema.parse(request.body),
    );
    return reply.status(202).send(report);
  });

  app.get("/v1/admin/content", async (request) => {
    await requireAdminRoles(request, options, ["content_editor", "content_reviewer", "publisher"]);
    return {
      entries: await options.contentService.listAdmin(AdminListQuerySchema.parse(request.query)),
    };
  });

  app.post("/v1/admin/content", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdminRoles(request, options, ["content_editor"]);
    return reply
      .status(201)
      .send({
        entry: await options.contentService.create(admin, ContentInputSchema.parse(request.body)),
      });
  });

  app.patch("/v1/admin/content/:id", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdminRoles(request, options, ["content_editor"]);
    const { id } = IdParamsSchema.parse(request.params);
    return {
      entry: await options.contentService.patch(admin, id, ContentPatchSchema.parse(request.body)),
    };
  });

  for (const action of ["submit", "approve", "publish", "archive"] as const) {
    app.post(`/v1/admin/content/:id/${action}`, async (request) => {
      requireTrustedRequestOrigin(request, options.config);
      const roles =
        action === "submit"
          ? ["content_editor"]
          : action === "approve"
            ? ["content_reviewer"]
            : ["publisher"];
      const { admin } = await requireAdminRoles(request, options, roles);
      const { id } = IdParamsSchema.parse(request.params);
      return { entry: await options.contentService.transition(admin, id, action) };
    });
  }

  app.post("/v1/admin/content/:id/schedule", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdminRoles(request, options, ["publisher"]);
    const { id } = IdParamsSchema.parse(request.params);
    const body = z.object({ publishAt: z.iso.datetime() }).strict().parse(request.body);
    return { entry: await options.contentService.schedule(admin, id, new Date(body.publishAt)) };
  });

  app.get("/v1/admin/moderation/reports", async (request) => {
    await requireAdminRoles(request, options, ["content_reviewer", "publisher", "security_admin"]);
    const query = z
      .object({
        status: z.enum(["open", "in_review", "resolved", "dismissed"]).default("open"),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);
    return { reports: await options.contentService.listReports(query.status, query.limit) };
  });

  app.post("/v1/admin/moderation/reports/:id/resolve", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdminRoles(request, options, [
      "content_reviewer",
      "publisher",
      "security_admin",
    ]);
    const { id } = IdParamsSchema.parse(request.params);
    return {
      report: await options.contentService.resolveReport(
        admin,
        id,
        ResolveReportSchema.parse(request.body),
      ),
    };
  });

  app.post("/v1/admin/access/:userId/roles", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdminRoles(request, options, ["security_admin"]);
    const { userId } = UserParamsSchema.parse(request.params);
    return {
      assignment: await options.contentService.assignRole(
        admin,
        userId,
        RoleAssignmentSchema.parse(request.body),
        request.id,
      ),
    };
  });

  app.delete("/v1/admin/access/:userId/roles/:role", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdminRoles(request, options, ["security_admin"]);
    const params = z
      .object({ userId: z.string().uuid(), role: RoleAssignmentSchema.shape.role })
      .parse(request.params);
    const body = z
      .object({ reason: z.string().trim().min(3).max(500) })
      .strict()
      .parse(request.body);
    return {
      assignment: await options.contentService.revokeRole(
        admin,
        params.userId,
        params.role,
        body.reason,
        request.id,
      ),
    };
  });

  app.get("/v1/admin/audit", async (request) => {
    await requireAdminRoles(request, options, ["security_admin"]);
    return {
      events: await options.contentService.auditEvents(AuditQuerySchema.parse(request.query)),
    };
  });

  app.post("/v1/admin/exports", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdminRoles(request, options, [
      "analyst",
      "payment_operator",
      "security_admin",
    ]);
    return reply
      .status(202)
      .send({
        export: await options.contentService.createExport(
          admin,
          ExportInputSchema.parse(request.body),
        ),
      });
  });
}
