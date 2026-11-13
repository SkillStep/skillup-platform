import { describe, expect, it, vi } from "vitest";

import {
  buildGrowthosConversion,
  readGrowthosBridgeConfig,
  submitGrowthosConversion,
  type GrowthosBridgeConfig,
  type VerifiedSkillupOrder,
} from "./growthos-conversion.js";

const brandId = "00000000-0000-4000-8000-000000000010";
const pageId = "00000000-0000-4000-8000-000000000050";
const versionId = "00000000-0000-4000-8000-000000000051";
const packageId = "00000000-0000-4000-8000-000000000024";
const variationId = "00000000-0000-4000-8000-000000000025";
const variationVersionId = "00000000-0000-4000-8000-000000000026";

const cfg: GrowthosBridgeConfig = {
  url: "https://growth-os-web-cod-5.vercel.app/api/conversions",
  token: "a".repeat(36),
  brandId,
  testTraffic: true,
};

const order: VerifiedSkillupOrder = {
  id: "00000000-0000-4000-8000-000000000300",
  status: "succeeded",
  plan_code: "premium-monthly",
  amount_minor: 99000,
  currency: "PKR",
  created_at: new Date("2026-11-13T12:00:00.000Z"),
  completed_at: new Date("2026-11-13T12:02:00.000Z"),
  attribution: {
    utm_source: "meta",
    utm_medium: "paid_social",
    utm_campaign: "november-meta",
    growthos_page_id: pageId,
    growthos_version_id: versionId,
    growthos_variation_id: variationId,
    growthos_variation_version_id: variationVersionId,
    growthos_package_id: packageId,
    growthos_package_code: "1",
    growthos_session_id: "session-12345678",
  },
};

describe("SkillUp authoritative GrowthOS checkout bridge", () => {
  it("remains off without explicit settings and refuses production without approval", () => {
    expect(readGrowthosBridgeConfig({}, "staging")).toBeNull();
    expect(() => readGrowthosBridgeConfig({ GROWTHOS_CONVERSION_ENABLED: "true" }, "staging")).toThrow();
    expect(() => readGrowthosBridgeConfig({
      GROWTHOS_CONVERSION_ENABLED: "true",
      GROWTHOS_CONVERSION_URL: cfg.url,
      GROWTHOS_CONVERSION_SECRET: cfg.token,
      GROWTHOS_BRAND_ID: brandId,
    }, "production")).toThrow(/approval/);
  });

  it("requires explicit HTTPS, exact endpoint, product credentials and no redirects", () => {
    expect(() => readGrowthosBridgeConfig({
      GROWTHOS_CONVERSION_ENABLED: "true",
      GROWTHOS_CONVERSION_URL: "https://attacker.example/api/conversions?callback=evil",
      GROWTHOS_CONVERSION_SECRET: cfg.token,
      GROWTHOS_BRAND_ID: brandId,
    }, "staging")).toThrow(/explicit HTTPS/);
    expect(readGrowthosBridgeConfig({
      GROWTHOS_CONVERSION_ENABLED: "true",
      GROWTHOS_CONVERSION_URL: cfg.url,
      GROWTHOS_CONVERSION_SECRET: cfg.token,
      GROWTHOS_BRAND_ID: brandId,
    }, "staging")).toMatchObject({ brandId, testTraffic: true });
  });

  it("uses verified charged amount, stable order ID, and matching GrowthOS identities", () => {
    const payload = buildGrowthosConversion(order, cfg);
    expect(payload).toMatchObject({
      idempotencyKey: "skillup-00000000-0000-4000-8000-000000000300",
      eventName: "subscription_started",
      occurredAt: "2026-11-13T12:02:00.000Z",
      brandId, pageId, versionId, value: 990, currency: "PKR",
      attribution: { lastTouch: { source: "meta", campaign: "november-meta" } },
      properties: { packageId, variationId, variationVersionId, packageCode: "1", marketingConsent: false, testTraffic: true },
    });
  });

  it("blocks unverified, failed, refunded, unknown-package and cross-plan orders", () => {
    for (const status of ["pending", "failed", "cancelled", "refunded"]) {
      expect(buildGrowthosConversion({ ...order, status }, cfg)).toBeNull();
    }
    expect(buildGrowthosConversion({ ...order, amount_minor: 0 }, cfg)).toBeNull();
    expect(buildGrowthosConversion({ ...order, plan_code: "premium-yearly" }, cfg)).toBeNull();
    expect(buildGrowthosConversion({ ...order, attribution: {} }, cfg)).toBeNull();
    expect(buildGrowthosConversion({ ...order, attribution: {
      ...(order.attribution as Record<string, unknown>), growthos_package_code: "unknown",
    } }, cfg)).toBeNull();
    expect(buildGrowthosConversion({ ...order, attribution: {
      ...(order.attribution as Record<string, unknown>), growthos_variation_version_id: "bad-uuid",
    } }, cfg)).toBeNull();
  });

  it("maps the yearly charge to Purchase without inventing advertising consent", () => {
    const payload = buildGrowthosConversion({
      ...order, plan_code: "premium-yearly", amount_minor: 499900,
      attribution: { ...(order.attribution as Record<string, unknown>), growthos_package_code: "2", utm_source: "T" },
    }, cfg);
    expect(payload).toMatchObject({
      eventName: "purchase", value: 4999,
      attribution: { lastTouch: { source: "tiktok" } },
      properties: { marketingConsent: false, testTraffic: true },
    });
  });

  it("accepts verified 201 and duplicate 200; retries ambiguous or rate-limited responses", async () => {
    const body = buildGrowthosConversion(order, cfg)!;
    const accepted = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ accepted: true }), { status: 201 }));
    expect(await submitGrowthosConversion(body, cfg, accepted)).toMatchObject({ outcome: "delivered", httpStatus: 201 });
    const init = accepted.mock.calls[0]?.[1];
    expect(init?.redirect).toBe("manual");
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${cfg.token}` });
    expect(await submitGrowthosConversion(body, cfg, async () =>
      new Response(JSON.stringify({ accepted: true, duplicate: true }), { status: 200 })))
      .toMatchObject({ outcome: "delivered", httpStatus: 200 });
    expect(await submitGrowthosConversion(body, cfg, async () =>
      new Response(JSON.stringify({ accepted: false }), { status: 200 })))
      .toMatchObject({ outcome: "retry", reason: "unconfirmed_response" });
    expect(await submitGrowthosConversion(body, cfg, async () =>
      new Response("slow", { status: 429 }))).toMatchObject({ outcome: "retry" });
    expect(await submitGrowthosConversion(body, cfg, async () =>
      new Response("error", { status: 401 }))).toMatchObject({ outcome: "blocked" });
    expect(await submitGrowthosConversion(body, cfg, async () => { throw Error("offline"); }))
      .toMatchObject({ outcome: "retry", reason: "network_error" });
    expect(await submitGrowthosConversion(body, cfg, async () =>
      new Response(null, { status: 302 }))).toMatchObject({ outcome: "blocked", reason: "redirect_rejected" });
  });
});
