import { describe, expect, it, vi } from "vitest";

import { readApiConfig } from "./config.js";
import {
  buildJazzCashV11ChargeFields,
  jazzCashV11SecureHash,
  redactJazzCashV11Fields,
  createJazzCashV11Client,
} from "./jazzcash-v11.js";

const v11Environment: NodeJS.ProcessEnv = {
  APP_ENV: "local",
  DEPLOYMENT_ENVIRONMENT: "local",
  PUBLIC_APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://skillup_test:test-only@127.0.0.1:5432/skillup_test",
  SESSION_SECRET: "test-only-session-secret-at-least-32-bytes",
  FEATURE_PREMIUM_ENABLED: "true",
  PREMIUM_JAZZCASH_V11_CHECKOUT: "true",
  JAZZCASH_V11_URL: "https://onlinepayments.example/m-wallet",
  JAZZCASH_V11_INQUIRY_URL: "https://onlinepayments.example/inquiry",
  JAZZCASH_V11_MERCHANT_ID: "MC990726",
  JAZZCASH_V11_PASSWORD: "cx4r0z207a",
  JAZZCASH_V11_INTEGRITY_SALT: "jbw5a799l4",
  JAZZCASH_V11_RETURN_URL: "http://localhost:3000/en/account/payment-return",
};

describe("JazzCash v11 orchestrator hashing", () => {
  it("hashes classic MWALLET fields and excludes mobile/cnic/mpin", () => {
    const classic = {
      pp_Amount: "59900",
      pp_BillReference: "B20260922120000",
      pp_Description: "SkillUp premium membership",
      pp_Language: "EN",
      pp_MerchantID: "MC990726",
      pp_Password: "cx4r0z207a",
      pp_ReturnURL: "http://localhost:3000/en/account/payment-return",
      pp_TxnCurrency: "PKR",
      pp_TxnDateTime: "20260922120000",
      pp_TxnExpiryDateTime: "20260922121500",
      pp_TxnRefNo: "Goo20260922120000A1",
      pp_TxnType: "MWALLET",
      pp_Version: "1.1",
    };
    const salt = "jbw5a799l4";
    const hash = jazzCashV11SecureHash(classic, salt);
    expect(hash).toMatch(/^[A-F0-9]{64}$/);

    const withSecrets = {
      ...classic,
      pp_MobileNumber: "03123456789",
      pp_CNIC: "345678",
      pp_MPIN: "5555",
    };
    expect(jazzCashV11SecureHash(withSecrets, salt)).toBe(hash);
  });

  it("adds mobile/cnic/mpin only after the secure hash", () => {
    const config = readApiConfig(v11Environment);
    const fields = buildJazzCashV11ChargeFields(config, {
      amountMinor: 59_900,
      billReference: "B20260922120000",
      description: "SkillUp premium membership",
      txnRefNo: "Goo20260922120000A1",
      txnDateTime: "20260922120000",
      txnExpiryDateTime: "20260922121500",
      msisdn: "03123456789",
      mpin: "5555",
      cnic: "345678",
    });

    expect(fields["pp_MobileNumber"]).toBe("03123456789");
    expect(fields["ppmpf_1"]).toBe("03123456789");
    expect(fields["pp_CNIC"]).toBe("345678");
    expect(fields["pp_MPIN"]).toBe("5555");
    expect(fields["pp_SecureHash"]).toMatch(/^[A-F0-9]{64}$/);

    const withoutSecrets = { ...fields };
    delete withoutSecrets["pp_MobileNumber"];
    delete withoutSecrets["pp_CNIC"];
    delete withoutSecrets["pp_MPIN"];
    expect(jazzCashV11SecureHash(withoutSecrets, "jbw5a799l4")).toBe(fields["pp_SecureHash"]);
  });

  it("redacts password, hash, and MPIN from loggable fields", () => {
    expect(
      redactJazzCashV11Fields({
        pp_Password: "secret",
        pp_SecureHash: "ABC",
        pp_MPIN: "5555",
        pp_CNIC: "345678",
        pp_TxnRefNo: "Goo20260922120000A1",
      }),
    ).toEqual({
      pp_Password: "[redacted]",
      pp_SecureHash: "[redacted]",
      pp_MPIN: "[redacted]",
      pp_CNIC: "[redacted]",
      pp_TxnRefNo: "Goo20260922120000A1",
    });
  });

  it("posts charge JSON to the orchestrator m-wallet URL", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://onlinepayments.example/m-wallet");
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body["pp_TxnType"]).toBe("MWALLET");
      expect(body["pp_MobileNumber"]).toBe("03123456789");
      expect(body["pp_MPIN"]).toBe("5555");
      expect(body["pp_CNIC"]).toBe("345678");
      expect(body["pp_SecureHash"]).toMatch(/^[A-F0-9]{64}$/);
      return new Response(
        JSON.stringify({
          pp_ResponseCode: "000",
          pp_ResponseMessage: "Thank you for using JazzCash.",
          pp_TxnRefNo: body["pp_TxnRefNo"],
          pp_Amount: body["pp_Amount"],
          pp_TxnCurrency: "PKR",
          pp_RetreivalReferenceNo: "RRN-V11-1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const client = createJazzCashV11Client(readApiConfig(v11Environment), fetcher as typeof fetch);
    const response = await client.charge({
      amountMinor: 59_900,
      billReference: "B20260922120000",
      description: "SkillUp premium membership",
      txnRefNo: "Goo20260922120000A1",
      txnDateTime: "20260922120000",
      txnExpiryDateTime: "20260922121500",
      msisdn: "03123456789",
      mpin: "5555",
      cnic: "345678",
    });

    expect(response["pp_ResponseCode"]).toBe("000");
    expect(response["pp_RetreivalReferenceNo"]).toBe("RRN-V11-1");
  });

  it("posts the exact JazzCash Transaction Status Inquiry field set", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://onlinepayments.example/inquiry");
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(Object.keys(body).sort()).toEqual(
        ["pp_MerchantID", "pp_Password", "pp_SecureHash", "pp_TxnRefNo", "pp_Version"].sort(),
      );
      expect(body["pp_MerchantID"]).toBe("MC990726");
      expect(body["pp_Password"]).toBe("cx4r0z207a");
      expect(body["pp_TxnRefNo"]).toBe("Goo20260922120000A1");
      expect(body["pp_Version"]).toBe("1.1");
      expect(body["pp_SecureHash"]).toMatch(/^[A-F0-9]{64}$/);

      const unhashed = { ...body };
      delete unhashed["pp_SecureHash"];
      expect(jazzCashV11SecureHash(unhashed, "jbw5a799l4")).toBe(body["pp_SecureHash"]);

      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          rrn: "RRN-INQUIRY-1",
          settlementDate: "20260922",
          settlementExpiryDate: "20260923120000",
          authCode: "AUTH1",
          bankID: "",
          productID: "",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const client = createJazzCashV11Client(readApiConfig(v11Environment), fetcher as typeof fetch);
    const response = await client.inquire({ txnRefNo: "Goo20260922120000A1" });
    expect(response["status"]).toBe("SUCCESS");
    expect(response["rrn"]).toBe("RRN-INQUIRY-1");
  });
});

describe("JazzCash v11 config gate", () => {
  it("rejects v11 checkout outside allowed deployments", () => {
    expect(() =>
      readApiConfig({
        ...v11Environment,
        APP_ENV: "production",
        DEPLOYMENT_ENVIRONMENT: "production",
      }),
    ).toThrow("PREMIUM_JAZZCASH_V11_CHECKOUT is only allowed");
  });

  it("accepts a complete local v11 configuration", () => {
    const config = readApiConfig(v11Environment);
    expect(config.PREMIUM_JAZZCASH_V11_CHECKOUT).toBe(true);
    expect(config.JAZZCASH_V11_MERCHANT_ID).toBe("MC990726");
  });
});
