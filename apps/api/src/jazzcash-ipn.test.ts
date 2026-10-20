import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  jazzCashSecureHash,
  verifyJazzCashIncomingSecureHash,
  verifyJazzCashSecureHash,
} from "./commercial.js";
import { jazzCashV11SecureHash } from "./jazzcash-v11.js";

const commercialSource = readFileSync(new URL("./commercial.ts", import.meta.url), "utf8");
const cpsSource = readFileSync(new URL("./jazzcash-cps.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("JazzCash IPN and refund wiring", () => {
  it("registers a public IPN route that does not require trusted origin", () => {
    expect(commercialSource).toContain('app.post("/v1/commercial/jazzcash/ipn"');
    expect(commercialSource).toContain("verifyJazzCashIncomingSecureHash");
    const ipnBlock = commercialSource.slice(
      commercialSource.indexOf('app.post("/v1/commercial/jazzcash/ipn"'),
      commercialSource.indexOf('app.post("/v1/commercial/jazzcash/ipn"') + 800,
    );
    expect(ipnBlock).not.toContain("requireTrustedRequestOrigin");
  });

  it("resolves CPS refund client for classic and V11 merchant modes", () => {
    expect(cpsSource).toContain("resolveJazzCashCpsClient");
    expect(cpsSource).toContain("JAZZCASH_V11_REFUND_URL");
    expect(indexSource).toContain("resolveJazzCashCpsClient(config)");
  });

  it("accepts classic lowercase and V11 uppercase SecureHash values", () => {
    const salt = "test-integrity-salt-32chars-min";
    const classicFields = {
      pp_Amount: "59900",
      pp_TxnCurrency: "PKR",
      pp_TxnRefNo: "SU20261020120000ABCD",
      pp_ResponseCode: "000",
    };
    const classicHash = jazzCashSecureHash(classicFields, salt);
    expect(
      verifyJazzCashIncomingSecureHash({ ...classicFields, pp_SecureHash: classicHash }, salt),
    ).toBe(true);
    expect(verifyJazzCashSecureHash({ ...classicFields, pp_SecureHash: classicHash }, salt)).toBe(
      true,
    );

    const v11Fields = {
      pp_Amount: "59900",
      pp_TxnCurrency: "PKR",
      pp_TxnRefNo: "Goo20261020120000A1",
      pp_ResponseCode: "000",
    };
    const v11Hash = jazzCashV11SecureHash(v11Fields, salt);
    expect(v11Hash).toMatch(/^[A-F0-9]{64}$/);
    expect(verifyJazzCashIncomingSecureHash({ ...v11Fields, pp_SecureHash: v11Hash }, salt)).toBe(
      true,
    );
  });
});
