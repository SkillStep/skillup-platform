import type { ApiConfig } from "./config.js";
import type { PaymentServiceClient, PaymentServicePlan } from "./payment-service-client.js";

export type LaunchPaymentPlan = Readonly<{
  localCode: "premium-monthly" | "premium-yearly";
  external: PaymentServicePlan;
}>;

export function launchPaymentServicePlans(config: ApiConfig): readonly LaunchPaymentPlan[] {
  return [
    {
      localCode: "premium-monthly",
      external: {
        code: config.PAYMENT_SERVICE_MONTHLY_PLAN_CODE ?? "monthly",
        interval: "monthly",
        fullAmountMinor: 59_900,
        stepAmountMinor: 59_900,
        trialHours: 0,
        currency: "PKR",
      },
    },
    {
      localCode: "premium-yearly",
      external: {
        code: config.PAYMENT_SERVICE_YEARLY_PLAN_CODE ?? "yearly",
        interval: "yearly",
        fullAmountMinor: 499_900,
        stepAmountMinor: 499_900,
        trialHours: 0,
        currency: "PKR",
      },
    },
  ] as const;
}

export function assertPaymentServiceLaunchPlans(
  config: ApiConfig,
  actualPlans: readonly PaymentServicePlan[],
): void {
  for (const expected of launchPaymentServicePlans(config)) {
    const actual = actualPlans.find((plan) => plan.code === expected.external.code);
    if (!actual) {
      throw new Error(`Payment-service plan ${expected.external.code} is missing.`);
    }
    if (
      actual.interval !== expected.external.interval ||
      actual.fullAmountMinor !== expected.external.fullAmountMinor ||
      actual.stepAmountMinor !== expected.external.stepAmountMinor ||
      (actual.trialHours ?? 24) !== expected.external.trialHours ||
      actual.currency !== "PKR"
    ) {
      throw new Error(`Payment-service plan ${expected.external.code} does not match SkillUp launch pricing.`);
    }
  }
}

export async function syncPaymentServiceLaunchPlans(
  config: ApiConfig,
  client: PaymentServiceClient,
): Promise<readonly LaunchPaymentPlan[]> {
  const expected = launchPaymentServicePlans(config);
  await client.upsertPlans(expected.map((plan) => plan.external));
  const actual = await client.listPlans();
  assertPaymentServiceLaunchPlans(config, actual);
  return expected;
}
