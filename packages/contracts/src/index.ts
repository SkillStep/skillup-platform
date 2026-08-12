import { z } from "zod";

export const PublicLocaleSchema = z.enum(["en", "ur"]);
export type PublicLocale = z.infer<typeof PublicLocaleSchema>;

export const ServiceHealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string().min(1),
  version: z.string().min(1),
  releaseSha: z.string().min(1),
  pipelineId: z.string().min(1).optional(),
  artifactRef: z.string().min(1).optional(),
  imageDigest: z.string().min(1).optional(),
  rollbackRef: z.string().min(1).optional(),
  timestamp: z.iso.datetime(),
});

export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
