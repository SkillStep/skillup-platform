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
    SMS_PROVIDER: z.enum(["disabled", "twilio"]).default("disabled"),
    TWILIO_ACCOUNT_SID: z.string().trim().min(1).max(100).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).max(500).optional(),
    TWILIO_PHONE_NUMBER: z.string().trim().regex(/^\\+[1-9]\\d{7,14}$/).optional(),
    SMS_REQUEST_TIMEOUT_SECONDS: z.coerce.number().int().min(3).max(30).default(10),
    FEATURE_PREMIUM_ENABLED: EnvironmentBooleanSchema,

    // Preferred launch integration: browser -> SkillUp BFF -> external payment service -> JazzCash.
    FEATURE_PAYMENT_SERVICE_ENABLED: EnvironmentBooleanSchema,
    PAYMENT_SERVICE_BASE_URL: OptionalUrlSchema,
    PAYMENT_SERVICE_API_KEY: z.string().trim().min(16).max(1_000).optional(),
    PAYMENT_SERVICE_WEBHOOK_SECRET: z.string().min(16).max(1_000).optional(),
    PAYMENT_SERVICE_APP_RETURN_URL: OptionalUrlSchema,
    PAYMENT_SERVICE_MONTHLY_PLAN_CODE: z.string().trim().min(1).max(64).default("monthly"),
    PAYMENT_SERVICE_YEARLY_PLAN_CODE: z.string().trim().min(1).max(64).default("yearly"),
    PAYMENT_SERVICE_TIMEOUT_SECONDS: z.coerce.number().int().min(3).max(60).default(15),

    // Legacy direct-provider path. Keep fail-closed during the payment-service migration.
    FEATURE_JAZZCASH_ENABLED: EnvironmentBooleanSchema,
    JAZZCASH_MODE: z.enum(["disabled", "sandbox", "production"]).default("disabled"),
    JAZZCASH_MERCHANT_ID: z.string().trim().min(1).max(100).optional(),
    JAZZCASH_PASSWORD: z.string().min(1).max(500).optional(),
    JAZZCASH_INTEGRITY_SALT: z.string().min(8).max(500).optional(),
    JAZZCASH_PAYMENT_URL: OptionalUrlSchema,
    JAZZCASH_RETURN_URL: OptionalUrlSchema,
    JAZZCASH_STATUS_URL: OptionalUrlSchema,
    JAZZCASH_REFUND_URL: OptionalUrlSchema,
    JAZZCASH_REFUND_ENVELOPE: z.enum(["refund-request", "flat"]).default("refund-request"),
    JAZZCASH_CPS_TIMEOUT_SECONDS: z.coerce.number().int().min(3).max(60).default(15),
    JAZZCASH_VERSION: z.string().trim().min(1).max(20).default("1.1"),
    JAZZCASH_TXN_TYPE: z.enum(["MWALLET", "MIGS", "OTC"]).default("MWALLET"),
    JAZZCASH_BANK_ID: z.string().trim().max(40).default(""),
    JAZZCASH_PRODUCT_ID: z.string().trim().max(40).default(""),
    JAZZCASH_CHECKOUT_MINUTES: z.coerce.number().int().min(5).max(60).default(15),

    // JazzCash payment-orchestrator MWALLET v1 (non-production only).
    PREMIUM_JAZZCASH_V11_CHECKOUT: EnvironmentBooleanSchema,
    DEPLOYMENT_ENVIRONMENT: z.string().trim().min(1).max(40).optional(),
    JAZZCASH_V11_URL: OptionalUrlSchema,
    JAZZCASH_V11_INQUIRY_URL: OptionalUrlSchema,
    JAZZCASH_V11_MERCHANT_ID: z.string().trim().min(1).max(100).optional(),
    JAZZCASH_V11_PASSWORD: z.string().min(1).max(500).optional(),
    JAZZCASH_V11_INTEGRITY_SALT: z.string().min(8).max(500).optional(),
    JAZZCASH_V11_RETURN_URL: OptionalUrlSchema,
    JAZZCASH_V11_TIMEOUT_MS: z.coerce.number().int().min(3_000).max(60_000).default(30_000),
    JAZZCASH_V11_CHECKOUT_MINUTES: z.coerce.number().int().min(5).max(60).default(15),

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

    if (config.SMS_PROVIDER === "twilio") {
      for (const field of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"] as const) {
        if (!config[field]) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required when SMS_PROVIDER=twilio.`,
          });
        }
      }
    }

    if (config.FEATURE_PAYMENT_SERVICE_ENABLED) {
      if (!config.FEATURE_PREMIUM_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["FEATURE_PREMIUM_ENABLED"],
          message: "Premium must be enabled before the payment service can be enabled.",
        });
      }
      if (config.FEATURE_JAZZCASH_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["FEATURE_JAZZCASH_ENABLED"],
          message: "Direct JazzCash and external payment-service modes cannot be enabled together.",
        });
      }
      for (const field of [
        "PAYMENT_SERVICE_BASE_URL",
        "PAYMENT_SERVICE_API_KEY",
        "PAYMENT_SERVICE_WEBHOOK_SECRET",
      ] as const) {
        if (!config[field]) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required when the payment service is enabled.`,
          });
        }
      }
      if (
        config.PAYMENT_SERVICE_BASE_URL &&
        (config.APP_ENV === "staging" || config.APP_ENV === "production") &&
        !config.PAYMENT_SERVICE_BASE_URL.startsWith("https://")
      ) {
        context.addIssue({
          code: "custom",
          path: ["PAYMENT_SERVICE_BASE_URL"],
          message: "PAYMENT_SERVICE_BASE_URL must use HTTPS outside local/test environments.",
        });
      }
      if (
        config.PAYMENT_SERVICE_APP_RETURN_URL &&
        new URL(config.PAYMENT_SERVICE_APP_RETURN_URL).origin !==
          new URL(config.PUBLIC_APP_URL).origin
      ) {
        context.addIssue({
          code: "custom",
          path: ["PAYMENT_SERVICE_APP_RETURN_URL"],
          message: "The payment-service app return URL must use the public SkillUp origin.",
        });
      }
      if (config.PAYMENT_SERVICE_MONTHLY_PLAN_CODE === config.PAYMENT_SERVICE_YEARLY_PLAN_CODE) {
        context.addIssue({
          code: "custom",
          path: ["PAYMENT_SERVICE_YEARLY_PLAN_CODE"],
          message: "Monthly and yearly payment-service plan codes must differ.",
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
    } else {
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
        "JAZZCASH_STATUS_URL",
        "JAZZCASH_REFUND_URL",
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

      for (const field of [
        "JAZZCASH_PAYMENT_URL",
        "JAZZCASH_RETURN_URL",
        "JAZZCASH_STATUS_URL",
        "JAZZCASH_REFUND_URL",
      ] as const) {
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
    }

    if (config.PREMIUM_JAZZCASH_V11_CHECKOUT) {
      if (!config.FEATURE_PREMIUM_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["FEATURE_PREMIUM_ENABLED"],
          message: "Premium must be enabled before JazzCash v11 checkout can be enabled.",
        });
      }
      const deployment = (config.DEPLOYMENT_ENVIRONMENT ?? config.APP_ENV).trim().toLowerCase();
      if (!["staging", "development", "dev", "local", "test"].includes(deployment)) {
        context.addIssue({
          code: "custom",
          path: ["PREMIUM_JAZZCASH_V11_CHECKOUT"],
          message:
            "PREMIUM_JAZZCASH_V11_CHECKOUT is only allowed for staging, development, local, or test.",
        });
      }
      for (const field of [
        "JAZZCASH_V11_URL",
        "JAZZCASH_V11_INQUIRY_URL",
        "JAZZCASH_V11_MERCHANT_ID",
        "JAZZCASH_V11_PASSWORD",
        "JAZZCASH_V11_INTEGRITY_SALT",
        "JAZZCASH_V11_RETURN_URL",
      ] as const) {
        if (!config[field]) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required when PREMIUM_JAZZCASH_V11_CHECKOUT is enabled.`,
          });
        }
      }
      for (const field of [
        "JAZZCASH_V11_URL",
        "JAZZCASH_V11_INQUIRY_URL",
        "JAZZCASH_V11_RETURN_URL",
      ] as const) {
        const value = config[field];
        if (value && config.APP_ENV === "staging" && !value.startsWith("https://")) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} must use HTTPS in staging.`,
          });
        }
      }
      if (
        config.JAZZCASH_V11_RETURN_URL &&
        new URL(config.JAZZCASH_V11_RETURN_URL).origin !== new URL(config.PUBLIC_APP_URL).origin
      ) {
        context.addIssue({
          code: "custom",
          path: ["JAZZCASH_V11_RETURN_URL"],
          message: "The JazzCash v11 return URL must use the public SkillUp origin.",
        });
      }
    }
  });

type ParsedApiConfig = z.infer<typeof ApiConfigSchema>;
type OptionalInjectedConfig =
  | "MAINTENANCE_INTERVAL_SECONDS"
  | "SMS_PROVIDER"
  | "SMS_REQUEST_TIMEOUT_SECONDS"
  | "FEATURE_PAYMENT_SERVICE_ENABLED"
  | "PAYMENT_SERVICE_BASE_URL"
  | "PAYMENT_SERVICE_API_KEY"
  | "PAYMENT_SERVICE_WEBHOOK_SECRET"
  | "PAYMENT_SERVICE_APP_RETURN_URL"
  | "PAYMENT_SERVICE_MONTHLY_PLAN_CODE"
  | "PAYMENT_SERVICE_YEARLY_PLAN_CODE"
  | "PAYMENT_SERVICE_TIMEOUT_SECONDS"
  | "JAZZCASH_REFUND_ENVELOPE"
  | "JAZZCASH_CPS_TIMEOUT_SECONDS"
  | "DEPLOYMENT_ENVIRONMENT"
  | "PREMIUM_JAZZCASH_V11_CHECKOUT"
  | "JAZZCASH_V11_URL"
  | "JAZZCASH_V11_INQUIRY_URL"
  | "JAZZCASH_V11_MERCHANT_ID"
  | "JAZZCASH_V11_PASSWORD"
  | "JAZZCASH_V11_INTEGRITY_SALT"
  | "JAZZCASH_V11_RETURN_URL"
  | "JAZZCASH_V11_TIMEOUT_MS"
  | "JAZZCASH_V11_CHECKOUT_MINUTES"
  | "RELEASE_PIPELINE_ID"
  | "RELEASE_ARTIFACT_REF"
  | "RELEASE_IMAGE_DIGEST"
  | "ROLLBACK_ARTIFACT_REF";

export type ApiConfig = Omit<ParsedApiConfig, OptionalInjectedConfig> &
  Readonly<{
    MAINTENANCE_INTERVAL_SECONDS?: number;
    SMS_PROVIDER?: "disabled" | "twilio";
    SMS_REQUEST_TIMEOUT_SECONDS?: number;
    FEATURE_PAYMENT_SERVICE_ENABLED?: boolean;
    PAYMENT_SERVICE_BASE_URL?: string | undefined;
    PAYMENT_SERVICE_API_KEY?: string | undefined;
    PAYMENT_SERVICE_WEBHOOK_SECRET?: string | undefined;
    PAYMENT_SERVICE_APP_RETURN_URL?: string | undefined;
    PAYMENT_SERVICE_MONTHLY_PLAN_CODE?: string;
    PAYMENT_SERVICE_YEARLY_PLAN_CODE?: string;
    PAYMENT_SERVICE_TIMEOUT_SECONDS?: number;
    JAZZCASH_REFUND_ENVELOPE?: "refund-request" | "flat";
    JAZZCASH_CPS_TIMEOUT_SECONDS?: number;
    DEPLOYMENT_ENVIRONMENT?: string | undefined;
    PREMIUM_JAZZCASH_V11_CHECKOUT?: boolean;
    JAZZCASH_V11_URL?: string | undefined;
    JAZZCASH_V11_INQUIRY_URL?: string | undefined;
    JAZZCASH_V11_MERCHANT_ID?: string | undefined;
    JAZZCASH_V11_PASSWORD?: string | undefined;
    JAZZCASH_V11_INTEGRITY_SALT?: string | undefined;
    JAZZCASH_V11_RETURN_URL?: string | undefined;
    JAZZCASH_V11_TIMEOUT_MS?: number;
    JAZZCASH_V11_CHECKOUT_MINUTES?: number;
    RELEASE_PIPELINE_ID?: string;
    RELEASE_ARTIFACT_REF?: string;
    RELEASE_IMAGE_DIGEST?: string;
    ROLLBACK_ARTIFACT_REF?: string;
  }>;

const JAZZCASH_V11_ALLOWED_DEPLOYMENTS = new Set([
  "staging",
  "development",
  "dev",
  "local",
  "test",
]);

export function isJazzCashV11EnvironmentAllowed(
  config: Readonly<{ APP_ENV: string; DEPLOYMENT_ENVIRONMENT?: string | undefined }>,
): boolean {
  const deployment = (config.DEPLOYMENT_ENVIRONMENT ?? config.APP_ENV).trim().toLowerCase();
  return JAZZCASH_V11_ALLOWED_DEPLOYMENTS.has(deployment);
}

export function isJazzCashV11CheckoutEnabled(config: ApiConfig): boolean {
  return (
    Boolean(config.PREMIUM_JAZZCASH_V11_CHECKOUT) &&
    Boolean(config.FEATURE_PREMIUM_ENABLED) &&
    isJazzCashV11EnvironmentAllowed(config)
  );
}

function omitEmptyEnvValues(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const normalized: NodeJS.ProcessEnv = { ...environment };
  for (const [key, value] of Object.entries(normalized)) {
    if (value === "") {
      delete normalized[key];
    }
  }
  return normalized;
}

export function readApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const normalized = omitEmptyEnvValues(environment);
  return ApiConfigSchema.parse({
    ...normalized,
    API_PORT: normalized["API_PORT"] ?? normalized["PORT"],
  });
}
