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
      verifyJazzCashSecureHash(
        { ...fields, pp_Amount: "1", pp_SecureHash: secureHash },
        salt,
      ),
    ).toBe(false);
  });

  it("rejects missing and malformed secure hashes", () => {
    expect(verifyJazzCashSecureHash({ pp_Amount: "59900" }, "test-integrity-salt")).toBe(
      false,
    );
    expect(
      verifyJazzCashSecureHash(
        { pp_Amount: "59900", pp_SecureHash: "not-a-hash" },
        "test-integrity-salt",
      ),
    ).toBe(false);
  });
});
