import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AuthService, AuthenticatedLearner } from "./auth.js";
import { type AdminIdentity, type AdminService, createAdminService } from "./admin-service.js";
import type { ApiConfig } from "./config.js";
import {
  RequestAuthorizationError,
  requireAuthenticatedLearner,
  requireTrustedRequestOrigin,
} from "./request-auth.js";

export { createAdminService };
export type { AdminIdentity, AdminService };

const GenerateRequestSchema = z
  .object({
    task: z.enum([
      "generate_level",
      "generate_distractors",
      "generate_explanation",
      "summarize_content",
      "classify_difficulty",
      "evaluate_content",
      "translate_content",
    ]),
    targetType: z.string().trim().min(2).max(80),
    targetId: z.string().trim().min(1).max(200).nullable().optional(),
    locale: z.enum(["en", "ur"]).default("en"),
    promptVersion: z.string().trim().min(1).max(80),
    requestedItems: z.number().int().min(1).max(100).default(1),
  })
  .strict();

const ReviewArtifactSchema = z
  .object({
    decision: z.enum(["approve", "reject", "request_changes", "escalate"]),
    reason: z.string().trim().min(3).max(1_000),
    editedContent: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

const PublishArtifactSchema = z
  .object({
    targetType: z.string().trim().min(2).max(80),
    targetVersionId: z.string().uuid(),
    reason: z.string().trim().min(3).max(1_000),
  })
  .strict();

const RollbackArtifactSchema = z.object({ reason: z.string().trim().min(3).max(1_000) }).strict();

const ResolveReconciliationSchema = z
  .object({
    disposition: z.enum(["resolved", "ignored"]),
    resolution: z.string().trim().min(3).max(1_000),
  })
  .strict();

const CorrectEntitlementSchema = z
  .object({
    nextStatus: z.enum(["active", "grace", "expired", "cancelled", "refunded", "revoked"]),
    endsAt: z.string().datetime().optional(),
    graceEndsAt: z.string().datetime().nullable().optional(),
    reason: z.string().trim().min(3).max(500),
    evidenceReference: z.string().trim().min(3).max(500).nullable().optional(),
  })
  .strict();

const ArtifactQuerySchema = z.object({
  status: z
    .enum(["draft", "held", "in_review", "approved", "rejected", "published", "superseded"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const ReconciliationQuerySchema = z.object({
  status: z.enum(["open", "resolved", "ignored"]).default("open"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const IdParamsSchema = z.object({ id: z.string().uuid() });
const LearnerParamsSchema = z.object({ userId: z.string().uuid() });

function hasCapability(identity: AdminIdentity, capability: string): boolean {
  return identity.capabilities.includes(capability);
}

async function requireAdmin(
  request: FastifyRequest,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    adminService: AdminService;
  }>,
  capability: string,
): Promise<Readonly<{ learner: AuthenticatedLearner; admin: AdminIdentity }>> {
  const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
  const admin = await options.adminService.resolveIdentity(learner.id);
  if (!admin || !hasCapability(admin, capability)) {
    await options.adminService.audit({
      actorUserId: learner.id,
      action: capability,
      targetType: "admin_route",
      targetId: request.routeOptions.url ?? request.url,
      result: "denied",
      reason: "Missing administrative capability",
      correlationId: request.id,
    });
    throw new RequestAuthorizationError(403, "Administrative access is not allowed.");
  }
  return { learner, admin };
}

export function registerAdminRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    adminService: AdminService;
  }>,
): void {
  app.get("/v1/admin/session", async (request) => {
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const admin = await options.adminService.resolveIdentity(learner.id);
    if (!admin) throw new RequestAuthorizationError(403, "Administrative access is not allowed.");
    return { admin };
  });

  app.post("/v1/admin/ai/requests", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "ai.request");
    const body = GenerateRequestSchema.parse(request.body);
    return reply
      .status(202)
      .send(await options.adminService.createGenerationRequest(admin, body, request.id));
  });

  app.get("/v1/admin/ai/artifacts", async (request) => {
    await requireAdmin(request, options, "ai.review");
    const query = ArtifactQuerySchema.parse(request.query);
    return { artifacts: await options.adminService.listArtifacts(query.status, query.limit) };
  });

  app.post("/v1/admin/ai/artifacts/:id/reviews", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "ai.review");
    const { id } = IdParamsSchema.parse(request.params);
    const body = ReviewArtifactSchema.parse(request.body);
    return { artifact: await options.adminService.reviewArtifact(admin, id, body, request.id) };
  });

  app.post("/v1/admin/ai/artifacts/:id/publish", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "ai.publish");
    const { id } = IdParamsSchema.parse(request.params);
    const body = PublishArtifactSchema.parse(request.body);
    return { publication: await options.adminService.publishArtifact(admin, id, body, request.id) };
  });

  app.post("/v1/admin/ai/artifacts/:id/rollback", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "content.rollback");
    const { id } = IdParamsSchema.parse(request.params);
    const body = RollbackArtifactSchema.parse(request.body);
    return {
      publication: await options.adminService.rollbackArtifact(admin, id, body.reason, request.id),
    };
  });

  app.get("/v1/admin/reconciliation", async (request) => {
    await requireAdmin(request, options, "payment.read");
    const query = ReconciliationQuerySchema.parse(request.query);
    return {
      cases: await options.adminService.listReconciliation(query.status, query.limit),
    };
  });

  app.post("/v1/admin/reconciliation/:id/resolve", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "payment.reconcile");
    const { id } = IdParamsSchema.parse(request.params);
    const body = ResolveReconciliationSchema.parse(request.body);
    return {
      case: await options.adminService.resolveReconciliation(admin, id, body, request.id),
    };
  });

  app.post("/v1/admin/entitlements/:id/correct", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requireAdmin(request, options, "entitlement.correct");
    const { id } = IdParamsSchema.parse(request.params);
    const body = CorrectEntitlementSchema.parse(request.body);
    return {
      entitlement: await options.adminService.correctEntitlement(admin, id, body, request.id),
    };
  });

  app.get("/v1/admin/learners/:userId/support", async (request) => {
    await requireAdmin(request, options, "learner.support.read");
    const { userId } = LearnerParamsSchema.parse(request.params);
    return options.adminService.supportLearner(userId);
  });

  app.get("/v1/admin/metrics", async (request) => {
    await requireAdmin(request, options, "metrics.read");
    return { metrics: await options.adminService.metrics() };
  });
}
