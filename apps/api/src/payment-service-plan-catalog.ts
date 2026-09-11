import type { ApiConfig } from "./config.js";
import type { ExternalPaymentClient, ExternalPaymentPlan } from "./external-payment-client.js";

export type LaunchPaymentPlan = Readonly<{
  localCode: "premium-monthly" | "premium-yearly";
  external: ExternalPaymentPlan;
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

export function paymentServicePlanMatches(
  expected: ExternalPaymentPlan,
  actual: ExternalPaymentPlan | undefined,
): boolean {
  return Boolean(
    actual &&
      actual.code === expected.code &&
      actual.interval === expected.interval &&
      actual.fullAmountMinor === expected.fullAmountMinor &&
      actual.stepAmountMinor === expected.stepAmountMinor &&
      (actual.trialHours ?? 24) === expected.trialHours &&
      actual.currency === "PKR",
  );
}

export function assertPaymentServiceLaunchPlans(
  config: ApiConfig,
  actualPlans: readonly ExternalPaymentPlan[],
): void {
  for (const expected of launchPaymentServicePlans(config)) {
    const actual = actualPlans.find((plan) => plan.code === expected.external.code);
    if (!paymentServicePlanMatches(expected.external, actual)) {
      throw new Error(
        `Payment-service plan ${expected.external.code} is missing or does not match SkillUp launch pricing.`,
      );
    }
  }
}

export async function syncPaymentServiceLaunchPlans(
  config: ApiConfig,
  client: ExternalPaymentClient,
): Promise<readonly LaunchPaymentPlan[]> {
  const expected = launchPaymentServicePlans(config);
  await client.upsertPlans(expected.map((plan) => plan.external));
  const actual = await client.listPlans();
  assertPaymentServiceLaunchPlans(config, actual);
  return expected;
}
