import { describe, expect, it, vi } from "vitest";

import { readApiConfig } from "./config.js";
import type { ExternalPaymentClient, ExternalPaymentPlan } from "./external-payment-client.js";
import {
  assertPaymentServiceLaunchPlans,
  launchPaymentServicePlans,
  syncPaymentServiceLaunchPlans,
} from "./payment-service-plan-catalog.js";

const config = readApiConfig({
  APP_ENV: "test",
  PUBLIC_APP_URL: "https://skillup.example",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  SESSION_SECRET: "plan-catalog-test-secret-at-least-32-bytes",
  FEATURE_PREMIUM_ENABLED: "true",
  FEATURE_PAYMENT_SERVICE_ENABLED: "true",
  PAYMENT_SERVICE_BASE_URL: "https://payments.example",
  PAYMENT_SERVICE_API_KEY: "test-product-api-key-at-least-16",
  PAYMENT_SERVICE_WEBHOOK_SECRET: "test-webhook-secret-at-least-16",
});

const expected: readonly ExternalPaymentPlan[] = [
  {
    code: "monthly",
    interval: "monthly",
    fullAmountMinor: 59_900,
    stepAmountMinor: 59_900,
    trialHours: 0,
    currency: "PKR",
  },
  {
    code: "yearly",
    interval: "yearly",
    fullAmountMinor: 499_900,
    stepAmountMinor: 499_900,
    trialHours: 0,
    currency: "PKR",
  },
];

describe("SkillUp payment-service launch catalog", () => {
  it("pins monthly/yearly prices, disables step-down and starts billing without a trial", () => {
    expect(launchPaymentServicePlans(config).map(({ external }) => external)).toEqual(expected);
  });

  it("rejects cheaper step pricing or an accidental free trial", () => {
    expect(() =>
      assertPaymentServiceLaunchPlans(config, [
        { ...expected[0]!, stepAmountMinor: 24_900 },
        expected[1]!,
      ]),
    ).toThrow("does not match SkillUp launch pricing");

    expect(() =>
      assertPaymentServiceLaunchPlans(config, [
        { ...expected[0]!, trialHours: 24 },
        expected[1]!,
      ]),
    ).toThrow("does not match SkillUp launch pricing");
  });

  it("upserts and then verifies the authoritative catalog", async () => {
    const upsertPlans = vi.fn(async () => ({}));
    const listPlans = vi.fn(async () => expected);
    const client = {
      upsertPlans,
      listPlans,
    } as unknown as ExternalPaymentClient;

    const result = await syncPaymentServiceLaunchPlans(config, client);
    expect(upsertPlans).toHaveBeenCalledWith(expected);
    expect(listPlans).toHaveBeenCalledTimes(1);
    expect(result.map(({ localCode }) => localCode)).toEqual([
      "premium-monthly",
      "premium-yearly",
    ]);
  });
});
