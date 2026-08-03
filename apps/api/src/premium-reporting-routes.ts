import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AdminIdentity, AdminService } from "./admin.js";
import type { AuthService, AuthenticatedLearner } from "./auth.js";
import type { ApiConfig } from "./config.js";
import {
  PremiumExportInputSchema,
  PremiumLedgerQuerySchema,
  PremiumPlanTransitionSchema,
  PremiumPlanVersionInputSchema,
  PremiumReconciliationQuerySchema,
  PremiumReportQuerySchema,
  premiumAccess,
} from "./premium-reporting-contract.js";
import type { PremiumReportingService } from "./premium-reporting-service.js";
import {
  RequestAuthorizationError,
  requireAuthenticatedLearner,
  requireTrustedRequestOrigin,
} from "./request-auth.js";

const IdParamsSchema = z.object({ id: z.string().uuid() });
const ExportHistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

type PremiumRequirement =
  | "report.read"
  | "report.export"
  | "subscription.read"
  | "subscription.adjust"
  | "plan.read"
  | "plan.manage"
  | "payment.reconcile";

function requirementAllowed(identity: AdminIdentity, requirement: PremiumRequirement): boolean {
  const access = premiumAccess(identity);
  if (requirement === "report.read") return access.canReadReports;
  if (requirement === "report.export") return access.canExportReports;
  if (requirement === "subscription.read") return access.canReadSubscriptions;
  if (requirement === "subscription.adjust") return access.canAdjustSubscriptions;
  if (requirement === "plan.read") return access.canReadPlans;
  if (requirement === "plan.manage") return access.canManagePlans;
  return access.canReconcilePayments;
}

async function requirePremiumAdmin(
  request: FastifyRequest,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    adminService: AdminService;
  }>,
  requirement: PremiumRequirement,
): Promise<Readonly<{ learner: AuthenticatedLearner; admin: AdminIdentity }>> {
  const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
  const admin = await options.adminService.resolveIdentity(learner.id);
  if (!admin || !requirementAllowed(admin, requirement)) {
    await options.adminService.audit({
      actorUserId: learner.id,
      actorRole: admin?.roles[0] ?? null,
      action: `premium.${requirement}`,
      targetType: "admin_route",
      targetId: request.routeOptions.url ?? request.url,
      result: "denied",
      reason: "Missing Premium administration capability",
      correlationId: request.id,
    });
    throw new RequestAuthorizationError(403, "Premium administration access is not allowed.");
  }
  return { learner, admin };
}

export function registerPremiumReportingRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    adminService: AdminService;
    reportingService: PremiumReportingService;
  }>,
): void {
  app.get("/v1/admin/reports/premium/access", async (request) => {
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const admin = await options.adminService.resolveIdentity(learner.id);
    if (!admin) throw new RequestAuthorizationError(403, "Administrative access is not allowed.");
    return { admin, premium: premiumAccess(admin) };
  });

  app.get("/v1/admin/reports/premium/summary", async (request) => {
    await requirePremiumAdmin(request, options, "report.read");
    return options.reportingService.summary(PremiumReportQuerySchema.parse(request.query));
  });

  app.get("/v1/admin/reports/premium/payments", async (request) => {
    await requirePremiumAdmin(request, options, "subscription.read");
    return options.reportingService.payments(PremiumLedgerQuerySchema.parse(request.query));
  });

  app.get("/v1/admin/reports/premium/memberships", async (request) => {
    await requirePremiumAdmin(request, options, "subscription.read");
    return options.reportingService.memberships(PremiumLedgerQuerySchema.parse(request.query));
  });

  app.get("/v1/admin/reports/premium/recurring-customers", async (request) => {
    await requirePremiumAdmin(request, options, "report.read");
    return options.reportingService.recurringCustomers(PremiumLedgerQuerySchema.parse(request.query));
  });

  app.get("/v1/admin/reports/premium/reconciliation", async (request) => {
    await requirePremiumAdmin(request, options, "report.read");
    return options.reportingService.reconciliation(
      PremiumReconciliationQuerySchema.parse(request.query),
    );
  });

  app.get("/v1/admin/reports/premium/plans", async (request) => {
    await requirePremiumAdmin(request, options, "plan.read");
    return options.reportingService.plans();
  });

  app.post("/v1/admin/reports/premium/plans/versions", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requirePremiumAdmin(request, options, "plan.manage");
    const version = await options.reportingService.createPlanVersion(
      admin,
      PremiumPlanVersionInputSchema.parse(request.body),
      request.id,
    );
    return reply.status(201).send({ version });
  });

  app.post("/v1/admin/reports/premium/plans/versions/:id/activate", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requirePremiumAdmin(request, options, "plan.manage");
    const { id } = IdParamsSchema.parse(request.params);
    const body = PremiumPlanTransitionSchema.parse(request.body);
    return {
      version: await options.reportingService.activatePlanVersion(
        admin,
        id,
        body.reason,
        request.id,
      ),
    };
  });

  app.post("/v1/admin/reports/premium/plans/versions/:id/retire", async (request) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requirePremiumAdmin(request, options, "plan.manage");
    const { id } = IdParamsSchema.parse(request.params);
    const body = PremiumPlanTransitionSchema.parse(request.body);
    return {
      version: await options.reportingService.retirePlanVersion(
        admin,
        id,
        body.reason,
        request.id,
      ),
    };
  });

  app.post("/v1/admin/reports/premium/exports", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const { admin } = await requirePremiumAdmin(request, options, "report.export");
    const reportExport = await options.reportingService.createExport(
      admin,
      PremiumExportInputSchema.parse(request.body),
      request.id,
    );
    return reply.status(201).send({ export: reportExport });
  });

  app.get("/v1/admin/reports/premium/exports", async (request) => {
    await requirePremiumAdmin(request, options, "report.export");
    const { limit } = ExportHistorySchema.parse(request.query);
    return options.reportingService.exportHistory(limit);
  });

  app.get("/v1/admin/reports/premium/exports/:id/download", async (request, reply) => {
    await requirePremiumAdmin(request, options, "report.export");
    const { id } = IdParamsSchema.parse(request.params);
    const reportExport = await options.reportingService.downloadExport(id);
    return reply
      .header("content-type", reportExport.contentType)
      .header("content-disposition", `attachment; filename="${reportExport.filename}"`)
      .header("x-content-type-options", "nosniff")
      .send(reportExport.payload);
  });
}
