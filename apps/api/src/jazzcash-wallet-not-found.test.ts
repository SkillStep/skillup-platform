import { describe, expect, it } from "vitest";

import { isJazzCashWalletNotRegisteredFailure } from "./jazzcash-v11-billing.js";

describe("isJazzCashWalletNotRegisteredFailure", () => {
  it("detects wallet-missing provider messages", () => {
    expect(isJazzCashWalletNotRegisteredFailure("199", "Wallet not registered")).toBe(true);
    expect(isJazzCashWalletNotRegisteredFailure("402", "No wallet for MSISDN")).toBe(true);
    expect(isJazzCashWalletNotRegisteredFailure("000", "Success")).toBe(false);
    expect(isJazzCashWalletNotRegisteredFailure("101", "Insufficient balance")).toBe(false);
  });
});
