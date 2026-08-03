import type { DatabaseClient } from "@skillup/database";

import type { AdminIdentity, AdminService } from "./admin.js";
import { createPremiumExportService } from "./premium-export-service.js";
import { createPremiumPlanService } from "./premium-plan-service.js";
import type {
  PremiumExportInput,
  PremiumLedgerQuery,
  PremiumPlanVersionInput,
  PremiumReconciliationQuery,
  PremiumReportQuery,
} from "./premium-reporting-contract.js";
import { createPremiumQueryService } from "./premium-reporting-queries.js";

export type PremiumReportResult = Readonly<Record<string, unknown>>;

export type PremiumReportingService = Readonly<{
  summary: (query: PremiumReportQuery) => Promise<PremiumReportResult>;
  payments: (query: PremiumLedgerQuery) => Promise<PremiumReportResult>;
  memberships: (query: PremiumLedgerQuery) => Promise<PremiumReportResult>;
  recurringCustomers: (query: PremiumLedgerQuery) => Promise<PremiumReportResult>;
  reconciliation: (query: PremiumReconciliationQuery) => Promise<PremiumReportResult>;
  plans: () => Promise<PremiumReportResult>;
  createPlanVersion: (
    actor: AdminIdentity,
    input: PremiumPlanVersionInput,
    correlationId: string,
  ) => Promise<PremiumReportResult>;
  activatePlanVersion: (
    actor: AdminIdentity,
    versionId: string,
    reason: string,
    correlationId: string,
  ) => Promise<PremiumReportResult>;
  retirePlanVersion: (
    actor: AdminIdentity,
    versionId: string,
    reason: string,
    correlationId: string,
  ) => Promise<PremiumReportResult>;
  activateDuePlanVersions: (limit?: number) => Promise<number>;
  createExport: (
    actor: AdminIdentity,
    input: PremiumExportInput,
    correlationId: string,
  ) => Promise<PremiumReportResult>;
  exportHistory: (limit: number) => Promise<PremiumReportResult>;
  downloadExport: (
    exportId: string,
  ) => Promise<Readonly<{ filename: string; contentType: string; payload: Buffer }>>;
}>;

export function createPremiumReportingService(options: Readonly<{
  pool: DatabaseClient["pool"];
  adminService: AdminService;
  now?: () => Date;
}>): PremiumReportingService {
  const queryService = createPremiumQueryService(options.pool);
  const planService = createPremiumPlanService(options);
  const exportService = createPremiumExportService({
    ...options,
    queryService,
  });

  return {
    summary: queryService.summary,
    payments: queryService.payments,
    memberships: queryService.memberships,
    recurringCustomers: queryService.recurringCustomers,
    reconciliation: queryService.reconciliation,
    plans: queryService.plans,
    createPlanVersion: planService.createVersion,
    activatePlanVersion: planService.activateVersion,
    retirePlanVersion: planService.retireVersion,
    activateDuePlanVersions: planService.activateDueVersions,
    createExport: exportService.create,
    exportHistory: exportService.history,
    downloadExport: exportService.download,
  };
}
