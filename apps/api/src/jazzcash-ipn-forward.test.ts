import { describe, expect, it } from "vitest";

import {
  acknowledgeExternalWalletReturn,
  acknowledgeJazzCashIpn,
  postJazzCashIpn,
} from "./jazzcash-ipn-forward.js";

const fields = { pp_TxnRefNo: "T1", pp_ResponseCode: "000", pp_SecureHash: "abc" };

describe("JazzCash IPN forward", () => {
  it("posts the original fields to the payment service callback", async () => {
    let seenUrl = "";
    let seenBody = "";
    const result = await postJazzCashIpn("http://127.0.0.1:8080", 5, fields, async (url, init) => {
      seenUrl = String(url);
      seenBody = String(init?.body);
      return new Response(JSON.stringify({ ok: true, kind: "payment", outcome: "applied" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    expect(seenUrl).toBe("http://127.0.0.1:8080/v1/api/callback");
    expect(JSON.parse(seenBody)).toEqual(fields);
    expect(result.disposition).toBe("applied");
  });

  it("treats a bad hash as a rejection and an unknown reference as unknown", async () => {
    const invalid = await postJazzCashIpn("http://payments.example", 5, fields, async () => {
      return new Response(JSON.stringify({ error: "invalid_hash" }), { status: 400 });
    });
    expect(invalid.disposition).toBe("invalid_hash");

    const unknown = await postJazzCashIpn("http://payments.example", 5, fields, async () => {
      return new Response(JSON.stringify({ ok: true, kind: "ignored", outcome: "unknown" }), {
        status: 200,
      });
    });
    expect(unknown.disposition).toBe("unknown");
  });

  it("returns the payment-service result and keeps legacy orders when the reference is unknown there", async () => {
    const applied = await acknowledgeJazzCashIpn({
      fields,
      forward: async () => ({ disposition: "applied", body: { ok: true, kind: "payment" } }),
      settleLocal: () => Promise.reject(new Error("should not settle locally")),
    });
    expect(applied.statusCode).toBe(200);

    const legacy = await acknowledgeJazzCashIpn({
      fields,
      forward: async () => ({ disposition: "unknown" }),
      settleLocal: async () => ({ merchantReference: "SU1", status: "succeeded" }),
    });
    expect(legacy).toEqual({
      statusCode: 200,
      body: { received: true, merchantReference: "SU1", status: "succeeded" },
    });

    const missing = await acknowledgeJazzCashIpn({
      fields,
      forward: async () => ({ disposition: "unknown" }),
      settleLocal: () => Promise.reject(Object.assign(new Error("missing"), { statusCode: 404 })),
    });
    expect(missing.statusCode).toBe(200);
    expect(missing.body).toEqual({ received: true, status: "ignored_unknown" });
  });

  it("turns a linked wallet return into a pending order and keeps failures", () => {
    const linked = acknowledgeExternalWalletReturn(
      { disposition: "applied", body: { ok: true, kind: "wallet", outcome: "linked" } },
      "R1",
    );
    expect(linked).toEqual({
      statusCode: 201,
      body: {
        checkoutMode: "jazzcash_wallet_link",
        order: { id: "R1", status: "pending" },
      },
    });

    const failed = acknowledgeExternalWalletReturn(
      { disposition: "applied", body: { ok: true, kind: "wallet", outcome: "failed" } },
      "R1",
    );
    expect(failed.statusCode).toBe(402);

    const missing = acknowledgeExternalWalletReturn({ disposition: "unknown" }, "R1");
    expect(missing.statusCode).toBe(404);
  });

  it("asks JazzCash to retry when the payment service cannot be reached and the order is not local", async () => {
    const ack = await acknowledgeJazzCashIpn({
      fields,
      forward: async () => ({ disposition: "unavailable" }),
      settleLocal: () => Promise.reject(Object.assign(new Error("missing"), { statusCode: 404 })),
    });
    expect(ack.statusCode).toBe(502);
  });
});
