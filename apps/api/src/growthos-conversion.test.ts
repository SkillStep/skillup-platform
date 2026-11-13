import { describe, expect, it, vi } from "vitest";

import {
  buildGrowthosConversion,
  createGrowthosConversionTask,
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
    expect(() =>
      readGrowthosBridgeConfig({ GROWTHOS_CONVERSION_ENABLED: "true" }, "staging"),
    ).toThrow();
    expect(() =>
      readGrowthosBridgeConfig(
        {
          GROWTHOS_CONVERSION_ENABLED: "true",
          GROWTHOS_CONVERSION_URL: cfg.url,
          GROWTHOS_CONVERSION_SECRET: cfg.token,
          GROWTHOS_BRAND_ID: brandId,
        },
        "production",
      ),
    ).toThrow(/approval/);
  });

  it("requires explicit HTTPS, exact endpoint, product credentials and no redirects", () => {
    expect(() =>
      readGrowthosBridgeConfig(
        {
          GROWTHOS_CONVERSION_ENABLED: "true",
          GROWTHOS_CONVERSION_URL: "https://attacker.example/api/conversions?callback=evil",
          GROWTHOS_CONVERSION_SECRET: cfg.token,
          GROWTHOS_BRAND_ID: brandId,
        },
        "staging",
      ),
    ).toThrow(/explicit HTTPS/);
    expect(
      readGrowthosBridgeConfig(
        {
          GROWTHOS_CONVERSION_ENABLED: "true",
          GROWTHOS_CONVERSION_URL: cfg.url,
          GROWTHOS_CONVERSION_SECRET: cfg.token,
          GROWTHOS_BRAND_ID: brandId,
        },
        "staging",
      ),
    ).toMatchObject({ brandId, testTraffic: true });
  });

  it("uses verified charged amount, stable order ID, and matching GrowthOS identities", () => {
    const payload = buildGrowthosConversion(order, cfg);
    expect(payload).toMatchObject({
      idempotencyKey: "skillup-00000000-0000-4000-8000-000000000300",
      eventName: "subscription_started",
      occurredAt: "2026-11-13T12:02:00.000Z",
      brandId,
      pageId,
      versionId,
      value: 990,
      currency: "PKR",
      attribution: { lastTouch: { source: "meta", campaign: "november-meta" } },
      properties: {
        packageId,
        variationId,
        variationVersionId,
        packageCode: "1",
        marketingConsent: false,
        testTraffic: true,
      },
    });
  });

  it("blocks unverified, failed, refunded, unknown-package and cross-plan orders", () => {
    for (const status of ["pending", "failed", "cancelled", "refunded"]) {
      expect(buildGrowthosConversion({ ...order, status }, cfg)).toBeNull();
    }
    expect(buildGrowthosConversion({ ...order, amount_minor: 0 }, cfg)).toBeNull();
    expect(buildGrowthosConversion({ ...order, plan_code: "premium-yearly" }, cfg)).toBeNull();
    expect(buildGrowthosConversion({ ...order, attribution: {} }, cfg)).toBeNull();
    expect(
      buildGrowthosConversion(
        {
          ...order,
          attribution: {
            ...(order.attribution as Record<string, unknown>),
            growthos_package_code: "unknown",
          },
        },
        cfg,
      ),
    ).toBeNull();
    expect(
      buildGrowthosConversion(
        {
          ...order,
          attribution: {
            ...(order.attribution as Record<string, unknown>),
            growthos_variation_version_id: "bad-uuid",
          },
        },
        cfg,
      ),
    ).toBeNull();
  });

  it("maps the yearly charge to Purchase without inventing advertising consent", () => {
    const payload = buildGrowthosConversion(
      {
        ...order,
        plan_code: "premium-yearly",
        amount_minor: 499900,
        attribution: {
          ...(order.attribution as Record<string, unknown>),
          growthos_package_code: "2",
          utm_source: "T",
        },
      },
      cfg,
    );
    expect(payload).toMatchObject({
      eventName: "purchase",
      value: 4999,
      attribution: { lastTouch: { source: "tiktok" } },
      properties: { marketingConsent: false, testTraffic: true },
    });
  });

  it("accepts verified 201 and duplicate 200; retries ambiguous or rate-limited responses", async () => {
    const body = buildGrowthosConversion(order, cfg);
    if (!body) throw new Error("Expected a verified conversion payload");
    const accepted = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ accepted: true }), { status: 201 }),
    );
    expect(await submitGrowthosConversion(body, cfg, accepted)).toMatchObject({
      outcome: "delivered",
      httpStatus: 201,
    });
    const init = accepted.mock.calls[0]?.[1];
    expect(init?.redirect).toBe("manual");
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${cfg.token}` });
    expect(
      await submitGrowthosConversion(
        body,
        cfg,
        async () =>
          new Response(JSON.stringify({ accepted: true, duplicate: true }), { status: 200 }),
      ),
    ).toMatchObject({ outcome: "delivered", httpStatus: 200 });
    expect(
      await submitGrowthosConversion(
        body,
        cfg,
        async () => new Response(JSON.stringify({ accepted: false }), { status: 200 }),
      ),
    ).toMatchObject({ outcome: "retry", reason: "unconfirmed_response" });
    expect(
      await submitGrowthosConversion(body, cfg, async () => new Response("slow", { status: 429 })),
    ).toMatchObject({ outcome: "retry" });
    expect(
      await submitGrowthosConversion(body, cfg, async () => new Response("error", { status: 401 })),
    ).toMatchObject({ outcome: "blocked" });
    expect(
      await submitGrowthosConversion(body, cfg, async () => {
        throw Error("offline");
      }),
    ).toMatchObject({ outcome: "retry", reason: "network_error" });
    expect(
      await submitGrowthosConversion(body, cfg, async () => new Response(null, { status: 302 })),
    ).toMatchObject({ outcome: "blocked", reason: "redirect_rejected" });
  });
  it("never selects sandbox or unsigned events for a real conversion", async () => {
    const statements: string[] = [];
    const pool = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rowCount: 0, rows: [] };
      },
    } as unknown as Parameters<typeof createGrowthosConversionTask>[0]["pool"];
    const run = createGrowthosConversionTask({ pool, config: cfg });
    expect(await run()).toEqual({ queued: 0, delivered: 0, blocked: 0, retry: 0 });
    expect(statements).toHaveLength(2);
    const enqueue = statements[0] ?? "";
    expect(enqueue).toContain("o.provider = 'jazzcash'");
    expect(enqueue).toContain("ev.provider='jazzcash'");
    expect(enqueue).toContain("ev.signature_verified=true");
    expect(enqueue).toContain("ev.provider_status='000'");
    expect(enqueue).toContain("e.status='active'");
    expect(enqueue).toContain("on conflict (order_id) do nothing");
  });

  it("rechecks signed payment and entitlement before dispatching, then marks one order delivered", async () => {
    const statements: string[] = [];
    const payloads: unknown[] = [];
    const pool = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("insert into growthos_conversion_outbox")) {
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes("with due as")) {
          return { rowCount: 1, rows: [{ order_id: order.id, attempts: 1 }] };
        }
        if (sql.includes("select o.id::text")) {
          return { rowCount: 1, rows: [order] };
        }
        if (sql.includes("update growthos_conversion_outbox")) {
          return { rowCount: 1, rows: [] };
        }
        throw new Error("Unexpected database statement");
      },
    } as unknown as Parameters<typeof createGrowthosConversionTask>[0]["pool"];
    const fetcher: typeof fetch = async (_url, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ accepted: true }), { status: 201 });
    };
    const run = createGrowthosConversionTask({ pool, config: cfg, fetcher });
    expect(await run(1)).toEqual({ queued: 1, delivered: 1, blocked: 0, retry: 0 });
    expect(statements[2]).toContain("o.provider='jazzcash'");
    expect(statements[2]).toContain("ev.provider='jazzcash'");
    expect(statements[2]).toContain("ev.signature_verified=true");
    expect(statements[2]).toContain("e.status='active'");
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      idempotencyKey: `skillup-${order.id}`,
      value: 990,
      currency: "PKR",
      properties: { marketingConsent: false, testTraffic: true },
    });
    expect(statements[3]).toContain("where order_id=$1 and status='processing'");
  });
});
