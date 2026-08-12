import { z } from "zod";

const EnvironmentBooleanSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const OptionalUrlSchema = z.string().url().optional();

const ApiConfigSchema = z
  .object({
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    PUBLIC_APP_URL: z.string().url(),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
        message: "DATABASE_URL must use PostgreSQL.",
      }),
    DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(50).default(10),
    MAINTENANCE_INTERVAL_SECONDS: z.coerce.number().int().min(15).max(3_600).default(60),
    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default("skillup_session"),
    SESSION_SECRET: z.string().min(32),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(15).max(10_080).default(60),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(8_760).default(168),
    AUTH_CHALLENGE_MINUTES: z.coerce.number().int().min(5).max(30).default(10),
    EMAIL_PROVIDER: z.enum(["disabled", "smtp"]).default("disabled"),
    EMAIL_FROM: z.string().trim().email().optional(),
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: EnvironmentBooleanSchema,
    SMTP_REQUIRE_TLS: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    SMTP_USERNAME: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    FEATURE_PREMIUM_ENABLED: EnvironmentBooleanSchema,
    FEATURE_JAZZCASH_ENABLED: EnvironmentBooleanSchema,
    JAZZCASH_MODE: z.enum(["disabled", "sandbox", "production"]).default("disabled"),
    JAZZCASH_MERCHANT_ID: z.string().trim().min(1).max(100).optional(),
    JAZZCASH_PASSWORD: z.string().min(1).max(500).optional(),
    JAZZCASH_INTEGRITY_SALT: z.string().min(8).max(500).optional(),
    JAZZCASH_PAYMENT_URL: OptionalUrlSchema,
    JAZZCASH_RETURN_URL: OptionalUrlSchema,
    JAZZCASH_VERSION: z.string().trim().min(1).max(20).default("1.1"),
    JAZZCASH_TXN_TYPE: z.enum(["MWALLET", "MIGS", "OTC"]).default("MWALLET"),
    JAZZCASH_BANK_ID: z.string().trim().min(1).max(40).default("TBANK"),
    JAZZCASH_PRODUCT_ID: z.string().trim().min(1).max(40).default("RETL"),
    JAZZCASH_CHECKOUT_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    RELEASE_SHA: z.string().min(1).default("local"),
    RELEASE_PIPELINE_ID: z.string().min(1).default("local"),
    RELEASE_ARTIFACT_REF: z.string().min(1).default("local"),
    RELEASE_IMAGE_DIGEST: z.string().min(1).default("local"),
    ROLLBACK_ARTIFACT_REF: z.string().min(1).default("unknown"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((config, context) => {
    if (config.EMAIL_PROVIDER === "smtp") {
      const requiredFields: ReadonlyArray<keyof typeof config> = [
        "EMAIL_FROM",
        "SMTP_HOST",
        "SMTP_USERNAME",
        "SMTP_PASSWORD",
      ];
      for (const field of requiredFields) {
        if (!config[field]) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required when EMAIL_PROVIDER=smtp.`,
          });
        }
      }

      if (config.SMTP_SECURE && config.SMTP_PORT !== 465) {
        context.addIssue({
          code: "custom",
          path: ["SMTP_PORT"],
          message: "SMTP_SECURE=true requires the implicit TLS port 465.",
        });
      }
    }

    if (config.FEATURE_JAZZCASH_ENABLED && !config.FEATURE_PREMIUM_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["FEATURE_PREMIUM_ENABLED"],
        message: "Premium must be enabled before JazzCash checkout can be enabled.",
      });
    }

    if (!config.FEATURE_JAZZCASH_ENABLED) {
      if (config.JAZZCASH_MODE !== "disabled") {
        context.addIssue({
          code: "custom",
          path: ["JAZZCASH_MODE"],
          message: "JAZZCASH_MODE must remain disabled while the feature flag is off.",
        });
      }
      return;
    }

    if (config.JAZZCASH_MODE === "disabled") {
      context.addIssue({
        code: "custom",
        path: ["JAZZCASH_MODE"],
        message: "An enabled JazzCash integration requires sandbox or production mode.",
      });
    }

    const requiredJazzCashFields: ReadonlyArray<keyof typeof config> = [
      "JAZZCASH_MERCHANT_ID",
      "JAZZCASH_PASSWORD",
      "JAZZCASH_INTEGRITY_SALT",
      "JAZZCASH_PAYMENT_URL",
      "JAZZCASH_RETURN_URL",
    ];
    for (const field of requiredJazzCashFields) {
      if (!config[field]) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is required when JazzCash is enabled.`,
        });
      }
    }

    if (config.APP_ENV === "production" && config.JAZZCASH_MODE !== "production") {
      context.addIssue({
        code: "custom",
        path: ["JAZZCASH_MODE"],
        message: "Production requires JAZZCASH_MODE=production.",
      });
    }
    if (config.APP_ENV !== "production" && config.JAZZCASH_MODE === "production") {
      context.addIssue({
        code: "custom",
        path: ["JAZZCASH_MODE"],
        message: "Production JazzCash mode is not allowed outside production.",
      });
    }

    for (const field of ["JAZZCASH_PAYMENT_URL", "JAZZCASH_RETURN_URL"] as const) {
      const value = config[field];
      if (
        value &&
        (config.APP_ENV === "staging" || config.APP_ENV === "production") &&
        !value.startsWith("https://")
      ) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} must use HTTPS outside local/test environments.`,
        });
      }
    }

    if (
      config.JAZZCASH_RETURN_URL &&
      new URL(config.JAZZCASH_RETURN_URL).origin !== new URL(config.PUBLIC_APP_URL).origin
    ) {
      context.addIssue({
        code: "custom",
        path: ["JAZZCASH_RETURN_URL"],
        message: "The JazzCash return URL must use the public SkillUp origin.",
      });
    }
  });

type ParsedApiConfig = z.infer<typeof ApiConfigSchema>;

export type ApiConfig = Omit<ParsedApiConfig, "MAINTENANCE_INTERVAL_SECONDS"> &
  Readonly<{ MAINTENANCE_INTERVAL_SECONDS?: number }>;

export function readApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiConfigSchema.parse({
    ...environment,
    API_PORT: environment["API_PORT"] ?? environment["PORT"],
  });
}
