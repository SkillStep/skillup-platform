import { describe, expect, it, vi } from "vitest";

import { readApiConfig } from "./config.js";
import {
  buildJazzCashTokenChargeFields,
  buildJazzCashWalletLinkForm,
  createJazzCashV11Client,
  jazzCashV11SecureHash,
  redactJazzCashV11Fields,
} from "./jazzcash-v11.js";

const v11Environment: NodeJS.ProcessEnv = {
  APP_ENV: "local",
  DEPLOYMENT_ENVIRONMENT: "local",
  PUBLIC_APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  SESSION_SECRET: "test-only-session-secret-at-least-32-bytes",
  FEATURE_PREMIUM_ENABLED: "true",
  PREMIUM_JAZZCASH_V11_CHECKOUT: "true",
  JAZZCASH_V11_URL:
    "https://onlinepayments.jazzcash.com.pk/payment-orchestrator/api/v4/rest/payments/m-wallet",
  JAZZCASH_V11_LINK_URL:
    "https://onlinepayments.jazzcash.com.pk/payment-orchestrator/WalletLinkingPortal/wallet/LinkWallet",
  JAZZCASH_V11_TOKEN_INQUIRY_URL:
    "https://onlinepayments.jazzcash.com.pk/payment-orchestrator/payment/api/v1/mobile-tokens/inquiry",
  JAZZCASH_V11_TOKEN_DELETE_URL:
    "https://onlinepayments.jazzcash.com.pk/payment-orchestrator/payment/api/v1/mobile-tokens/delete",
  JAZZCASH_V11_INQUIRY_URL:
    "https://onlinepayments.jazzcash.com.pk/payment-orchestrator/api/v2/rest/payments/status/inquiry",
  JAZZCASH_V11_MERCHANT_ID: "MC990984",
  JAZZCASH_V11_PASSWORD: "hr0g2b0w96",
  JAZZCASH_V11_INTEGRITY_SALT: "72syo1nh67",
  JAZZCASH_V11_RETURN_URL: "https://skillupshop.codistan.org/callback",
};

describe("JazzCash MWALLET recurring hashing", () => {
  it("hashes non-empty pp_* fields like the 2026 DOC sample", () => {
    const fields = {
      pp_MerchantID: "MC990984",
      pp_Password: "hr0g2b0w96",
      pp_MSISDN: "03123456789",
      pp_RequestID: "ReqId123",
      pp_ReturnURL: "https://skillupshop.codistan.org/callback",
    };
    const hash = jazzCashV11SecureHash(fields, "72syo1nh67");
    expect(hash).toMatch(/^[A-F0-9]{64}$/);
  });

  it("builds wallet-link form fields for the hosted portal", () => {
    const config = readApiConfig(v11Environment);
    const form = buildJazzCashWalletLinkForm(config, {
      msisdn: "03123456789",
      requestId: "ReqId123",
    });
    expect(form.actionUrl).toContain("LinkWallet");
    expect(form.fields["pp_MerchantID"]).toBe("MC990984");
    expect(form.fields["pp_MSISDN"]).toBe("03123456789");
    expect(form.fields["pp_RequestID"]).toBe("ReqId123");
    expect(form.fields["pp_SecureHash"]).toMatch(/^[A-F0-9]{64}$/);
  });

  it("builds pay-via-token fields without MPIN/CNIC", () => {
    const config = readApiConfig(v11Environment);
    const fields = buildJazzCashTokenChargeFields(config, {
      amountMinor: 100,
      billReference: "B20260629170332",
      description: "MWALLET Payment v4.0",
      paymentToken: "TOKEN-TEST",
      txnRefNo: "T20260629170332",
      txnDateTime: "20260629170332",
      txnExpiryDateTime: "20260630170332",
    });
    expect(fields["pp_PaymentToken"]).toBe("TOKEN-TEST");
    expect(fields["pp_Amount"]).toBe("100");
    expect(fields["pp_MobileNumber"]).toBeUndefined();
    expect(fields["pp_MPIN"]).toBeUndefined();
    expect(redactJazzCashV11Fields(fields)["pp_PaymentToken"]).toBe("[redacted]");
  });

  it("posts token charge JSON to the v4 m-wallet URL", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("/api/v4/rest/payments/m-wallet");
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body["pp_PaymentToken"]).toBe("TOKEN-TEST");
      return new Response(
        JSON.stringify({
          pp_ResponseCode: "000",
          pp_ResponseMessage: "Thank you for using JazzCash.",
          pp_TxnRefNo: body["pp_TxnRefNo"],
          pp_RetreivalReferenceNo: "RRN-1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const client = createJazzCashV11Client(readApiConfig(v11Environment), fetcher as typeof fetch);
    const response = await client.chargeWithToken({
      amountMinor: 100,
      billReference: "B20260629170332",
      description: "MWALLET Payment v4.0",
      paymentToken: "TOKEN-TEST",
      txnRefNo: "T20260629170332",
      txnDateTime: "20260629170332",
      txnExpiryDateTime: "20260630170332",
    });
    expect(response["pp_ResponseCode"]).toBe("000");
    expect(response["pp_RetreivalReferenceNo"]).toBe("RRN-1");
  });

  it("posts the exact JazzCash Transaction Status Inquiry field set", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(v11Environment["JAZZCASH_V11_INQUIRY_URL"]);
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(Object.keys(body).sort()).toEqual(
        ["pp_MerchantID", "pp_Password", "pp_SecureHash", "pp_TxnRefNo"].sort(),
      );
      expect(body["pp_MerchantID"]).toBe("MC990984");
      expect(body["pp_Password"]).toBe("hr0g2b0w96");
      expect(body["pp_TxnRefNo"]).toBe("Goo20260922120000A1");
      expect(body["pp_Version"]).toBeUndefined();
      expect(body["pp_SecureHash"]).toMatch(/^[A-F0-9]{64}$/);

      const unhashed = { ...body };
      delete unhashed["pp_SecureHash"];
      expect(jazzCashV11SecureHash(unhashed, "72syo1nh67")).toBe(body["pp_SecureHash"]);

      return new Response(
        JSON.stringify({
          pp_ResponseCode: "000",
          pp_Status: "Completed",
          pp_RetrievalReferenceNo: "RRN-INQUIRY-1",
          pp_AuthCode: "AUTH1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const client = createJazzCashV11Client(readApiConfig(v11Environment), fetcher as typeof fetch);
    const response = await client.inquirePaymentStatus({ txnRefNo: "Goo20260922120000A1" });
    expect(response["pp_ResponseCode"]).toBe("000");
    expect(response["pp_Status"]).toBe("Completed");
    expect(response["pp_RetrievalReferenceNo"]).toBe("RRN-INQUIRY-1");
  });
});

describe("JazzCash wallet-link config gate", () => {
  it("rejects checkout outside allowed deployments", () => {
    expect(() =>
      readApiConfig({
        ...v11Environment,
        APP_ENV: "production",
        DEPLOYMENT_ENVIRONMENT: "production",
      }),
    ).toThrow("PREMIUM_JAZZCASH_V11_CHECKOUT is only allowed");
  });

  it("accepts a complete local wallet-link configuration", () => {
    const config = readApiConfig(v11Environment);
    expect(config.PREMIUM_JAZZCASH_V11_CHECKOUT).toBe(true);
    expect(config.JAZZCASH_V11_MERCHANT_ID).toBe("MC990984");
    expect(config.JAZZCASH_V11_LINK_URL).toContain("LinkWallet");
  });
});
