import { z } from "zod";

const ApiConfigSchema = z.object({
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
      message: "DATABASE_URL must use PostgreSQL.",
    }),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(50).default(10),
  RELEASE_SHA: z.string().min(1).default("local"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function readApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiConfigSchema.parse(environment);
}
