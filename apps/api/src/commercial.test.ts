import { describe, expect, it } from "vitest";

import { jazzCashSecureHash, verifyJazzCashSecureHash } from "./commercial.js";

describe("JazzCash request authentication", () => {
  it("matches the official sandbox HMAC-SHA256 example", () => {
    const fields = {
      pp_Amount: "2995",
      pp_MerchantID: "MER123",
      pp_OrderInfo: "A48cvE28",
    };

    expect(jazzCashSecureHash(fields, "0F5DD14AE2")).toBe(
      "c7689cda7474eb1adcd343fd0c0b676bad0ba66361cc46db589bdb0da4c1c867",
    );
  });

  it("accepts an exact secure hash and rejects tampering", () => {
    const fields = {
      pp_Amount: "59900",
      pp_MerchantID: "MC12345",
      pp_TxnCurrency: "PKR",
      pp_TxnRefNo: "SU20260731153800AB12CD34",
    };
    const salt = "test-integrity-salt";
    const secureHash = jazzCashSecureHash(fields, salt);

    expect(verifyJazzCashSecureHash({ ...fields, pp_SecureHash: secureHash }, salt)).toBe(true);
    expect(
      verifyJazzCashSecureHash({ ...fields, pp_Amount: "1", pp_SecureHash: secureHash }, salt),
    ).toBe(false);
  });

  it("rejects missing and malformed secure hashes", () => {
    expect(verifyJazzCashSecureHash({ pp_Amount: "59900" }, "test-integrity-salt")).toBe(false);
    expect(
      verifyJazzCashSecureHash(
        { pp_Amount: "59900", pp_SecureHash: "not-a-hash" },
        "test-integrity-salt",
      ),
    ).toBe(false);
  });

  it("builds an uppercase secure hash for DoTransaction-shaped MWALLET fields", () => {
    const fields = {
      pp_Amount: "10000",
      pp_BillReference: "B20260917150138",
      pp_Description: "SkillUp premium membership",
      pp_Language: "EN",
      pp_MerchantID: "MC990726",
      pp_Password: "sandbox-password",
      pp_ReturnURL: "http://localhost:3000/en/account/payment-return",
      pp_TxnCurrency: "PKR",
      pp_TxnDateTime: "20260917150138",
      pp_TxnExpiryDateTime: "20260918150138",
      pp_TxnRefNo: "SU20260917150138ABCD",
      pp_TxnType: "MWALLET",
      pp_Version: "1.1",
      ppmpf_1: "03123456789",
    };
    const salt = "sandbox-integrity-salt";
    const hash = jazzCashSecureHash(fields, salt).toUpperCase();
    expect(hash).toMatch(/^[A-F0-9]{64}$/);
    expect(verifyJazzCashSecureHash({ ...fields, pp_SecureHash: hash }, salt)).toBe(true);
  });
});
