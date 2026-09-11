import { describe, expect, it, vi } from "vitest";

import { readApiConfig } from "./config.js";
import {
  createExternalPaymentClient,
  ExternalPaymentRequestError,
} from "./external-payment-client.js";

const config = readApiConfig({
  APP_ENV: "test",
  PUBLIC_APP_URL: "https://skillup.example",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  SESSION_SECRET: "external-payment-client-test-secret-32-bytes",
  FEATURE_PREMIUM_ENABLED: "true",
  FEATURE_PAYMENT_SERVICE_ENABLED: "true",
  PAYMENT_SERVICE_BASE_URL: "https://payments.example",
  PAYMENT_SERVICE_API_KEY: "server-only-product-api-key",
  PAYMENT_SERVICE_WEBHOOK_SECRET: "server-only-webhook-secret",
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("external payment-service client", () => {
  it("adds the server API key and forwards only the server-supplied wallet-link shape", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      jsonResponse({
        requestId: "request-1",
        returnUrl: "https://payments.example/v1/jazzcash/wallet-return",
        portalUrl: "https://jazzcash.example/link",
        method: "POST",
        fields: { pp_MerchantID: "masked-test", pp_SecureHash: "ephemeral-form-hash" },
      }),
    );
    const client = createExternalPaymentClient(config, fetcher as typeof fetch);

    await client.linkWallet({
      userId: "11111111-1111-4111-8111-111111111111",
      msisdn: "03001234567",
      planCode: "monthly",
      appReturnUrl: "https://skillup.example/en/account?billingReturn=1",
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://payments.example/v1/wallets/link");
    expect(init?.headers).toMatchObject({ "x-api-key": "server-only-product-api-key" });
    expect(JSON.parse(String(init?.body))).toEqual({
      userId: "11111111-1111-4111-8111-111111111111",
      msisdn: "03001234567",
      planCode: "monthly",
      appReturnUrl: "https://skillup.example/en/account?billingReturn=1",
    });
    expect(String(init?.body)).not.toContain("amountMinor");
  });

  it("does not send a JSON content-type header on bodyless GET requests", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      jsonResponse({
        wallet: { status: "none" },
        alreadySubscribed: false,
        status: {
          wallet_linked: false,
          subscription_status: null,
          current_period_paid: false,
        },
        subscriptions: [],
      }),
    );
    const client = createExternalPaymentClient(config, fetcher as typeof fetch);
    await client.getStatus("11111111-1111-4111-8111-111111111111");
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(init?.headers).toMatchObject({ "x-api-key": "server-only-product-api-key" });
    expect(init?.headers).not.toMatchObject({ "content-type": "application/json" });
  });

  it("maps upstream API-key rejection to a server integration error rather than learner 401", async () => {
    const client = createExternalPaymentClient(config, (async () =>
      jsonResponse({ error: "unauthorized", message: "bad key" }, 401)) as typeof fetch);

    await expect(client.listPlans()).rejects.toMatchObject({
      statusCode: 502,
      errorCode: "payment_service_unauthorized",
    } satisfies Partial<ExternalPaymentRequestError>);
  });

  it("fails closed on malformed successful responses", async () => {
    const client = createExternalPaymentClient(config, (async () =>
      jsonResponse({ wallet: "not-a-valid-status-response" })) as typeof fetch);

    await expect(client.getStatus("11111111-1111-4111-8111-111111111111")).rejects.toMatchObject({
      statusCode: 502,
      errorCode: "invalid_upstream_response",
    } satisfies Partial<ExternalPaymentRequestError>);
  });

  it("preserves documented payment-service errors such as rate limiting", async () => {
    const client = createExternalPaymentClient(config, (async () =>
      jsonResponse(
        { error: "rate_limited", message: "Back off and retry later" },
        429,
      )) as typeof fetch);

    await expect(client.listPayments("11111111-1111-4111-8111-111111111111")).rejects.toMatchObject(
      {
        statusCode: 429,
        errorCode: "rate_limited",
      } satisfies Partial<ExternalPaymentRequestError>,
    );
  });
});
