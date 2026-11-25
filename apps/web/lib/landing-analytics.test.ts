import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildLandingAnalyticsContext,
  LP_CONTEXT_STORAGE_KEY,
  LP_SENT_TOKENS_STORAGE_KEY,
  packageCommerceMapping,
  persistLandingAnalyticsContext,
  readLandingAnalyticsContext,
  rebuildLandingAnalyticsContext,
  trackAddToCart,
  trackLandingView,
  trackPaymentConversion,
} from "./landing-analytics";
import { UTM_ATTRIBUTION_STORAGE_KEY } from "./utm-attribution";

describe("landing analytics mapping", () => {
  it("maps monthly package to subscribe @ 990", () => {
    expect(packageCommerceMapping("default", "default")).toEqual({
      conversion_event: "subscribe",
      value: 990,
      item_name: "SkillUp Premium Monthly",
    });
  });

  it("maps yearly 20% off to purchase @ 3999", () => {
    expect(packageCommerceMapping("2", "20percentoff")).toEqual({
      conversion_event: "purchase",
      value: 3999,
      item_name: "SkillUp Premium Yearly (20% off)",
    });
  });

  it("maps utm T to tiktok traffic_source", () => {
    const context = buildLandingAnalyticsContext(
      { utm: "T", package: "2", parameter: "20percentoff", payment: "jazzcash" },
      { landing: "landing2" },
    );
    expect(context.traffic_source).toBe("tiktok");
    expect(context.conversion_event).toBe("purchase");
  });
});

describe("landing analytics session + events", () => {
  const sessionStore = new Map<string, string>();
  const localStore = new Map<string, string>();
  const events: Array<{ name: string; params: Record<string, unknown> }> = [];
  const tiktokEvents: string[] = [];

  afterEach(() => {
    sessionStore.clear();
    localStore.clear();
    events.length = 0;
    tiktokEvents.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeStorage(store: Map<string, string>) {
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
  }

  function stubBrowser(): void {
    const sessionStorage = makeStorage(sessionStore);
    const localStorage = makeStorage(localStore);
    vi.stubGlobal("window", {
      sessionStorage,
      localStorage,
      dataLayer: [],
      gtag: (...args: unknown[]) => {
        if (args[0] === "event" && typeof args[1] === "string") {
          events.push({
            name: args[1],
            params: (args[2] as Record<string, unknown>) ?? {},
          });
        }
      },
      ttq: {
        page: () => {
          tiktokEvents.push("PageView");
        },
        track: (name: string) => {
          tiktokEvents.push(name);
        },
        load: () => undefined,
        _loaded: true,
      },
      TiktokAnalyticsObject: "ttq",
    });
    vi.stubGlobal("document", {
      getElementById: () => ({ id: "skillup-ga4-gtag", content: "DBU5QHBC77UCDH70PUAG" }),
      querySelector: (sel: string) =>
        sel.includes("tiktok-pixel-id") ? { getAttribute: () => "DBU5QHBC77UCDH70PUAG" } : null,
      createElement: () => ({ id: "", async: false, src: "" }),
      getElementsByTagName: () => [],
      head: { appendChild: () => undefined },
    });
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TESTMEASURE1");
    vi.stubEnv("NEXT_PUBLIC_TIKTOK_PIXEL_ID", "DBU5QHBC77UCDH70PUAG");
  }

  it("persists lp_context to session + localStorage and fires landing_view + view_item", () => {
    stubBrowser();
    const context = buildLandingAnalyticsContext(
      { utm: "D", package: "default", parameter: "default", payment: "jazzcash" },
      { landing: "mainLanding" },
    );
    trackLandingView(context);
    expect(sessionStore.has(LP_CONTEXT_STORAGE_KEY)).toBe(true);
    expect(localStore.has(LP_CONTEXT_STORAGE_KEY)).toBe(true);
    expect(readLandingAnalyticsContext()?.package_id).toBe("default");
    expect(events.map((event) => event.name)).toEqual(["landing_view", "view_item"]);
  });

  it("recovers lp_context from localStorage when sessionStorage is empty (§3A)", () => {
    stubBrowser();
    const context = buildLandingAnalyticsContext(
      { utm: "T", package: "2", parameter: "20percentoff", payment: "jazzcash" },
      { landing: "landing2" },
    );
    persistLandingAnalyticsContext(context);
    sessionStore.clear();
    expect(readLandingAnalyticsContext()?.package_id).toBe("2");
    expect(sessionStore.has(LP_CONTEXT_STORAGE_KEY)).toBe(true);
  });

  it("rebuilds context from UTM attribution when lp_context is gone", () => {
    stubBrowser();
    localStore.set(
      UTM_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        attribution: {
          utm: "T",
          package: "2",
          parameter: "20percentoff",
          payment: "jazzcash",
          landing: "landing2",
        },
        capturedAt: Date.now(),
      }),
    );
    const rebuilt = rebuildLandingAnalyticsContext();
    expect(rebuilt.traffic_source).toBe("tiktok");
    expect(rebuilt.package_id).toBe("2");
  });

  it("fires Subscribe even when session lp_context was cleared after JazzCash return", () => {
    stubBrowser();
    const context = buildLandingAnalyticsContext(
      { utm: "T", package: "2", parameter: "20percentoff", payment: "jazzcash" },
      { landing: "landing2" },
    );
    persistLandingAnalyticsContext(context);
    trackAddToCart(context);
    sessionStore.clear();

    trackPaymentConversion({
      paymentStatus: "succeeded",
      transactionId: "order-1",
      receiptVerified: true,
    });
    trackPaymentConversion({
      paymentStatus: "succeeded",
      transactionId: "order-1",
      receiptVerified: true,
    });

    expect(events.map((event) => event.name)).toEqual([
      "add_to_cart",
      "begin_checkout",
      "payment_result",
      "purchase",
      "payment_result",
    ]);
    expect(tiktokEvents).toContain("InitiateCheckout");
    expect(tiktokEvents).toContain("AddPaymentInfo");
    expect(tiktokEvents.filter((name) => name === "Subscribe")).toEqual(["Subscribe"]);
    expect(localStore.get(LP_SENT_TOKENS_STORAGE_KEY)).toContain("order-1");
  });
});
