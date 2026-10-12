import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildLandingAnalyticsContext,
  LP_CONTEXT_STORAGE_KEY,
  LP_SENT_TOKENS_STORAGE_KEY,
  packageCommerceMapping,
  persistLandingAnalyticsContext,
  readLandingAnalyticsContext,
  trackAddToCart,
  trackLandingView,
  trackPaymentConversion,
} from "./landing-analytics";

describe("landing analytics mapping", () => {
  it("maps monthly package to subscribe @ 599", () => {
    expect(packageCommerceMapping("default", "default")).toEqual({
      conversion_event: "subscribe",
      value: 599,
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
  const store = new Map<string, string>();
  const events: Array<{ name: string; params: Record<string, unknown> }> = [];

  afterEach(() => {
    store.clear();
    events.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubBrowser(): void {
    const sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    vi.stubGlobal("window", {
      sessionStorage,
      dataLayer: [],
      gtag: (...args: unknown[]) => {
        if (args[0] === "event" && typeof args[1] === "string") {
          events.push({
            name: args[1],
            params: (args[2] as Record<string, unknown>) ?? {},
          });
        }
      },
    });
    vi.stubGlobal("document", {
      getElementById: () => ({ id: "skillup-ga4-gtag" }),
      createElement: () => ({ id: "", async: false, src: "" }),
      head: { appendChild: () => undefined },
    });
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TESTMEASURE1");
  }

  it("persists lp_context and fires landing_view + view_item", () => {
    stubBrowser();
    process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"] = "G-TESTMEASURE1";
    const context = buildLandingAnalyticsContext(
      { utm: "D", package: "default", parameter: "default", payment: "jazzcash" },
      { landing: "mainLanding" },
    );
    trackLandingView(context);
    expect(store.has(LP_CONTEXT_STORAGE_KEY)).toBe(true);
    expect(readLandingAnalyticsContext()?.package_id).toBe("default");
    expect(events.map((event) => event.name)).toEqual(["landing_view", "view_item"]);
  });

  it("fires add_to_cart then deduped purchase on payment success", () => {
    stubBrowser();
    process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"] = "G-TESTMEASURE1";
    const context = buildLandingAnalyticsContext(
      { utm: "T", package: "2", parameter: "20percentoff", payment: "jazzcash" },
      { landing: "landing2" },
    );
    persistLandingAnalyticsContext(context);
    trackAddToCart(context);
    trackPaymentConversion({ paymentStatus: "succeeded", transactionId: "order-1" });
    trackPaymentConversion({ paymentStatus: "succeeded", transactionId: "order-1" });

    expect(events.map((event) => event.name)).toEqual([
      "add_to_cart",
      "begin_checkout",
      "payment_result",
      "purchase",
      "payment_result",
    ]);
    expect(store.get(LP_SENT_TOKENS_STORAGE_KEY)).toContain("order-1");
  });
});
