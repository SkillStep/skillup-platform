import { readApiConfig } from "./config.js";
import { createPaymentServiceClient } from "./payment-service-client.js";
import { syncPaymentServiceLaunchPlans } from "./payment-service-plan-catalog.js";

const config = readApiConfig();
if (!config.FEATURE_PAYMENT_SERVICE_ENABLED) {
  throw new Error("FEATURE_PAYMENT_SERVICE_ENABLED=true is required to sync payment-service plans.");
}

const client = createPaymentServiceClient(config);
const synced = await syncPaymentServiceLaunchPlans(config, client);

console.log(
  JSON.stringify(
    {
      status: "ok",
      plans: synced.map(({ localCode, external }) => ({
        localCode,
        code: external.code,
        interval: external.interval,
        fullAmountMinor: external.fullAmountMinor,
        stepAmountMinor: external.stepAmountMinor,
        trialHours: external.trialHours,
        currency: external.currency,
      })),
    },
    null,
    2,
  ),
);
