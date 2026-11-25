import { afterEach, describe, expect, it } from "vitest";

import {
  signConversionReceipt,
  verifyConversionReceipt,
} from "./conversion-receipt";

describe("conversion receipt (§3A)", () => {
  afterEach(() => {
    delete process.env["SESSION_SECRET"];
    delete process.env["CONVERSION_RECEIPT_SECRET"];
  });

  it("signs and verifies a succeeded order receipt", () => {
    process.env["SESSION_SECRET"] = "test-only-session-secret-at-least-32-bytes";
    const now = 1_700_000_000_000;
    const receipt = signConversionReceipt("order-abc", "succeeded", now);
    expect(receipt).toBeTruthy();
    expect(verifyConversionReceipt(receipt!, { orderId: "order-abc", nowMs: now })).toEqual({
      ok: true,
      orderId: "order-abc",
      status: "succeeded",
    });
  });

  it("rejects expired or mismatched receipts", () => {
    process.env["SESSION_SECRET"] = "test-only-session-secret-at-least-32-bytes";
    const now = 1_700_000_000_000;
    const receipt = signConversionReceipt("order-abc", "succeeded", now);
    expect(receipt).toBeTruthy();
    expect(
      verifyConversionReceipt(receipt!, { orderId: "order-abc", nowMs: now + 16 * 60 * 1000 }).ok,
    ).toBe(false);
    expect(verifyConversionReceipt(receipt!, { orderId: "other", nowMs: now }).ok).toBe(false);
    expect(verifyConversionReceipt("not-a-receipt", { nowMs: now }).ok).toBe(false);
  });

  it("returns null when no signing secret is configured", () => {
    expect(signConversionReceipt("order-abc", "succeeded")).toBeNull();
  });
});
