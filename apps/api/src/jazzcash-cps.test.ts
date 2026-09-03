import { describe, expect, it, vi } from "vitest";

import { readApiConfig } from "./config.js";
import { createJazzCashCpsClient, type JazzCashCpsEvidence } from "./jazzcash-cps.js";

const environment: NodeJS.ProcessEnv = {
  APP_ENV: "test",
  PUBLIC_APP_URL: "https://skillup.example",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  SESSION_SECRET: "test-only-session-secret-at-least-32-bytes",
  FEATURE_PREMIUM_ENABLED: "true",
  FEATURE_JAZZCASH_ENABLED: "true",
  JAZZCASH_MODE: "sandbox",
  JAZZCASH_MERCHANT_ID: "MC12345",
  JAZZCASH_PASSWORD: "sandbox-password",
  JAZZCASH_INTEGRITY_SALT: "sandbox-integrity-salt",
  JAZZCASH_PAYMENT_URL: "https://sandbox.example/checkout",
  JAZZCASH_RETURN_URL: "https://skillup.example/en/account/payment-return",
  JAZZCASH_STATUS_URL: "https://sandbox.example/status",
  JAZZCASH_REFUND_URL: "https://sandbox.example/refund",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function expectEvidence(value: JazzCashCpsEvidence, operation: "status" | "refund") {
  expect(value.operation).toBe(operation);
  expect(value.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
}

describe("JazzCash CPS client", () => {
  it("sends a signed status inquiry without hard-coded provider credentials", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body["pp_TxnRefNo"]).toBe("SU202609030001");
      expect(body["pp_MerchantID"]).toBe("MC12345");
      expect(body["pp_Password"]).toBe("sandbox-password");
      expect(body["pp_SecureHash"]).toMatch(/^[a-f0-9]{64}$/);
      return jsonResponse({ status: "SUCCESS", rrn: "RRN123" });
    });
    const client = createJazzCashCpsClient(readApiConfig(environment), fetcher as typeof fetch);

    const evidence = await client.inquire({ merchantReference: "SU202609030001" });

    expectEvidence(evidence, "status");
    expect(evidence.providerStatus).toBe("SUCCESS");
    expect(evidence.providerReference).toBe("RRN123");
    expect(evidence.accepted).toBe(true);
  });

  it("uses the payment-portal refund envelope by default", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        RefundRequest: Record<string, string>;
      };
      expect(body.RefundRequest["pp_TxnRefNo"]).toBe("SU202609030002");
      expect(body.RefundRequest["pp_Amount"]).toBe("59900");
      expect(body.RefundRequest["pp_TxnCurrency"]).toBe("PKR");
      expect(body.RefundRequest["pp_SecureHash"]).toMatch(/^[a-f0-9]{64}$/);
      return jsonResponse({ responseCode: "000", responseMessage: "Refund accepted" });
    });
    const client = createJazzCashCpsClient(readApiConfig(environment), fetcher as typeof fetch);

    const evidence = await client.refund({
      merchantReference: "SU202609030002",
      amountMinor: 59_900,
      currency: "PKR",
    });

    expectEvidence(evidence, "refund");
    expect(evidence.responseCode).toBe("000");
    expect(evidence.accepted).toBe(true);
  });

  it("supports a merchant-pack flat refund payload without code changes", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body["pp_TxnRefNo"]).toBe("SU202609030003");
      expect(body["RefundRequest"]).toBeUndefined();
      return jsonResponse({ pp_ResponseCode: "000", pp_ResponseMessage: "OK" });
    });
    const client = createJazzCashCpsClient(
      readApiConfig({ ...environment, JAZZCASH_REFUND_ENVELOPE: "flat" }),
      fetcher as typeof fetch,
    );

    const evidence = await client.refund({
      merchantReference: "SU202609030003",
      amountMinor: 499_900,
      currency: "PKR",
    });

    expect(evidence.accepted).toBe(true);
  });

  it("fails closed on an unsuccessful refund response", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ responseCode: "999", responseMessage: "Rejected" }),
    );
    const client = createJazzCashCpsClient(readApiConfig(environment), fetcher as typeof fetch);

    const evidence = await client.refund({
      merchantReference: "SU202609030004",
      amountMinor: 59_900,
      currency: "PKR",
    });

    expect(evidence.accepted).toBe(false);
    expect(evidence.responseCode).toBe("999");
  });
});
