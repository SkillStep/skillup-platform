import { afterEach, describe, expect, it, vi } from "vitest";

import { logTikTokEvent, SKILLUP_TIKTOK_PIXEL_ID } from "./tiktok-pixel";

describe("tiktok pixel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the SkillUp TikTok Pixel and tracks AddToCart + CompletePayment only", () => {
    const track = vi.fn();
    const page = vi.fn();
    const load = vi.fn();
    const appendChild = vi.fn();
    const createElement = vi.fn(() => ({
      id: "",
      async: false,
      src: "",
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

    const commerce = {
      item_id: "premium-yearly",
      item_name: "SkillUp Premium Yearly (20% off)",
      value: 3999,
      currency: "PKR",
      traffic_source: "tiktok",
      landing: "landing2",
    } as const;

    logTikTokEvent("AddToCart", commerce);
    logTikTokEvent("CompletePayment", commerce, { eventId: "order-123" });

    expect(load).toHaveBeenCalledWith(SKILLUP_TIKTOK_PIXEL_ID);
    expect(page).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenNthCalledWith(
      1,
      "AddToCart",
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
      undefined,
    );
    expect(track).toHaveBeenNthCalledWith(
      2,
      "CompletePayment",
      expect.objectContaining({
        currency: "PKR",
        value: 3999,
      }),
      { event_id: "order-123" },
    );
  });
});
