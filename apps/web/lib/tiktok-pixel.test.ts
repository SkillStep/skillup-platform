import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureTikTokPixel, logTikTokEvent, SKILLUP_TIKTOK_PIXEL_ID } from "./tiktok-pixel";

describe("tiktok pixel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the SkillUp TikTok Pixel and tracks Subscribe with event_id", () => {
    const track = vi.fn();
    const page = vi.fn();
    const load = vi.fn();
    const appendChild = vi.fn();
    const createElement = vi.fn(() => ({
      id: "",
      async: false,
      src: "",
      type: "",
    }));

    const ttq = {
      track,
      page,
      load,
      _loaded: false,
      _i: {},
      _t: {},
      _o: {},
    };

    vi.stubGlobal("window", {
      ttq,
      TiktokAnalyticsObject: undefined,
    });
    vi.stubGlobal("document", {
      getElementById: () => null,
      querySelector: () => ({
        getAttribute: () => SKILLUP_TIKTOK_PIXEL_ID,
      }),
      createElement,
      getElementsByTagName: () => [],
      head: { appendChild },
    });

    logTikTokEvent("PageView");
    logTikTokEvent("ViewContent", {
      item_id: "premium-yearly",
      value: 3999,
      currency: "PKR",
    });
    logTikTokEvent("InitiateCheckout", {
      item_id: "premium-yearly",
      value: 3999,
      currency: "PKR",
    });
    logTikTokEvent("AddPaymentInfo", {
      item_id: "premium-yearly",
      value: 3999,
      currency: "PKR",
    });
    logTikTokEvent(
      "Subscribe",
      {
        item_id: "premium-yearly",
        item_name: "SkillUp Premium Yearly (20% off)",
        value: 3999,
        currency: "PKR",
        traffic_source: "tiktok",
        landing: "landing2",
      },
      { eventId: "order-123" },
    );

    expect(load).toHaveBeenCalledWith(SKILLUP_TIKTOK_PIXEL_ID);
    expect(page).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith(
      "Subscribe",
      expect.objectContaining({
        currency: "PKR",
        value: 3999,
        contents: [
          expect.objectContaining({
            content_id: "premium-yearly",
            content_name: "SkillUp Premium Yearly (20% off)",
          }),
        ],
      }),
      { event_id: "order-123" },
    );
    expect(track.mock.calls.map((call) => call[0])).toEqual([
      "ViewContent",
      "InitiateCheckout",
      "AddPaymentInfo",
      "Subscribe",
    ]);
  });

  it("uses an Array stub so the remote SDK can drain queued Subscribe", () => {
    const appendChild = vi.fn();
    const scriptEl = { id: "", async: false, src: "", type: "" };
    vi.stubGlobal("window", {
      TiktokAnalyticsObject: undefined,
    });
    vi.stubGlobal("document", {
      getElementById: () => null,
      querySelector: () => ({
        getAttribute: () => SKILLUP_TIKTOK_PIXEL_ID,
      }),
      createElement: () => scriptEl,
      getElementsByTagName: () => [],
      head: { appendChild },
    });

    expect(ensureTikTokPixel()).toBe(true);
    const ttq = (globalThis as unknown as { window: { ttq: unknown[] } }).window.ttq;
    expect(Array.isArray(ttq)).toBe(true);

    logTikTokEvent(
      "Subscribe",
      {
        item_id: "premium-yearly",
        item_name: "SkillUp Premium Yearly (20% off)",
        value: 3999,
        currency: "PKR",
      },
      { eventId: "order-queued" },
    );

    // Official stub queues onto the array itself: ["track", "Subscribe", payload, opts].
    expect(
      ttq.some((entry) => Array.isArray(entry) && entry[0] === "track" && entry[1] === "Subscribe"),
    ).toBe(true);
    const subscribe = ttq.find(
      (entry) => Array.isArray(entry) && entry[0] === "track" && entry[1] === "Subscribe",
    ) as unknown[];
    expect(JSON.stringify(subscribe)).toContain("order-queued");
    expect(scriptEl.src).toContain("analytics.tiktok.com/i18n/pixel/events.js");
    expect(scriptEl.src).toContain(SKILLUP_TIKTOK_PIXEL_ID);
  });
});
