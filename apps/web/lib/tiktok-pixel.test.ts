import { afterEach, describe, expect, it, vi } from "vitest";

import { logTikTokEvent, SKILLUP_TIKTOK_PIXEL_ID } from "./tiktok-pixel";

describe("tiktok pixel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the SkillUp TikTok Pixel and tracks CompletePayment with event_id", () => {
    const track = vi.fn();
    const page = vi.fn();
    const appendChild = vi.fn();
    const createElement = vi.fn(() => ({
      id: "",
      async: false,
      src: "",
    }));

    vi.stubGlobal("window", {
      ttq: undefined,
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

    // First call bootstraps ttq stubs; replace track/page after ensure.
    logTikTokEvent("PageView", { item_id: "premium-yearly", value: 3999, currency: "PKR" });
    const ttq = (globalThis as { window: { ttq: { track: typeof track; page: typeof page; load: () => void; _loaded?: boolean } } })
      .window.ttq;
    ttq.track = track;
    ttq.page = page;

    logTikTokEvent("PageView");
    logTikTokEvent(
      "CompletePayment",
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

    expect(page).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith(
      "CompletePayment",
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
    expect(createElement).toHaveBeenCalled();
    expect(appendChild).toHaveBeenCalled();
  });
});
