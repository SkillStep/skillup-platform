/**
 * TikTok Pixel (browser). Marketing only — never the source of truth for Premium Subs.
 * Pixel ID is public client-side config, same pattern as GA4 Measurement ID.
 *
 * Stub matches TikTok’s official base code: `ttq` is an Array whose entries the remote
 * SDK drains on load. A function/`q`-property stub leaves Subscribe stuck and never
 * sends `pixel/act` after JazzCash return.
 */

type TtqApi = {
  page: () => void;
  track: (
    event: string,
    params?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => void;
  load: (pixelId: string, options?: Record<string, unknown>) => void;
  ready?: (callback: () => void) => void;
};

type TtqQueue = TtqApi &
  Array<unknown[]> & {
    methods: string[];
    setAndDefer: (target: object, method: string) => void;
    instance?: (pixelId: string) => unknown;
    _i: Record<string, unknown[] & { _u?: string }>;
    _t: Record<string, number>;
    _o: Record<string, unknown>;
    _loaded?: boolean;
  };

declare global {
  interface Window {
    TiktokAnalyticsObject?: string;
    ttq?: TtqQueue;
  }
}

const SCRIPT_ID = "skillup-tiktok-pixel";
const META_NAME = "skillup-tiktok-pixel-id";
/** Client-provided SkillUp TikTok Pixel for /landing2 (utm=T) campaigns. */
export const SKILLUP_TIKTOK_PIXEL_ID = "DBU5QHBC77UCDH70PUAG";

function runtimePixelId(): string {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") {
    return "";
  }
  return document.querySelector(`meta[name="${META_NAME}"]`)?.getAttribute("content")?.trim() ?? "";
}

function pixelId(): string | null {
  const runtime = runtimePixelId();
  const buildTime = process.env["NEXT_PUBLIC_TIKTOK_PIXEL_ID"]?.trim() ?? "";
  const value = runtime || buildTime || SKILLUP_TIKTOK_PIXEL_ID;
  return /^[A-Z0-9]{10,64}$/i.test(value) ? value : null;
}

export function isTikTokPixelConfigured(): boolean {
  return pixelId() !== null;
}

/**
 * Official-style stub: Array + setAndDefer. Remote events.js drains array entries.
 * @see https://ads.tiktok.com/help/ (Events / Pixel base code)
 */
function createTtq(): TtqQueue {
  const ttq = [] as unknown as TtqQueue;

  ttq.methods = [
    "page",
    "track",
    "identify",
    "instances",
    "debug",
    "on",
    "off",
    "once",
    "ready",
    "alias",
    "group",
    "enableCookie",
    "disableCookie",
    "holdConsent",
    "revokeConsent",
    "grantConsent",
  ];
  ttq.setAndDefer = (target, method) => {
    Object.assign(target, {
      [method]: (...args: unknown[]) => {
        (target as TtqQueue).push([method, ...args]);
      },
    });
  };
  for (const method of ttq.methods) {
    ttq.setAndDefer(ttq, method);
  }

  ttq.instance = (pixelIdValue: string) => {
    let bucket = ttq._i[pixelIdValue];
    if (!bucket) {
      bucket = [] as unknown as unknown[] & { _u?: string };
      ttq._i[pixelIdValue] = bucket;
    }
    for (const method of ttq.methods) {
      ttq.setAndDefer(bucket, method);
    }
    return bucket;
  };

  ttq._i = {};
  ttq._t = {};
  ttq._o = {};
  ttq.load = (id, options = {}) => {
    const src = "https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i[id] = ttq._i[id] || ([] as unknown as unknown[] & { _u?: string });
    ttq._i[id]._u = src;
    ttq._t[id] = Date.now();
    ttq._o[id] = options;
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.type = "text/javascript";
    script.async = true;
    script.src = `${src}?sdkid=${encodeURIComponent(id)}&lib=ttq`;
    const first = document.getElementsByTagName("script")[0];
    if (first?.parentNode) {
      first.parentNode.insertBefore(script, first);
    } else {
      document.head.appendChild(script);
    }
  };

  return ttq;
}

function ensureTtq(): TtqApi | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const id = pixelId();
  if (!id) return null;

  window.TiktokAnalyticsObject = "ttq";
  if (!window.ttq) {
    window.ttq = createTtq();
  }
  if (!window.ttq._loaded) {
    window.ttq.load(id);
    window.ttq._loaded = true;
  }
  return window.ttq;
}

function commercePayload(
  params: Readonly<Record<string, string | number | boolean | undefined>>,
): Record<string, unknown> {
  const contents = [
    {
      content_id: String(params["item_id"] ?? params["package_id"] ?? "premium"),
      content_type: "product",
      content_name: String(params["item_name"] ?? "SkillUp Premium"),
    },
  ];
  const payload: Record<string, unknown> = {
    contents,
    content_type: "product",
    currency: params["currency"] ?? "PKR",
  };
  if (typeof params["value"] === "number") payload["value"] = params["value"];
  if (typeof params["traffic_source"] === "string")
    payload["traffic_source"] = params["traffic_source"];
  if (typeof params["utm_code"] === "string") payload["utm_code"] = params["utm_code"];
  if (typeof params["banner_parameter"] === "string") {
    payload["banner_parameter"] = params["banner_parameter"];
  }
  if (typeof params["landing"] === "string") payload["landing"] = params["landing"];
  return payload;
}

function dispatchTtqEvent(
  ttq: TtqApi,
  eventName: string,
  params: Readonly<Record<string, string | number | boolean | undefined>>,
  options: Readonly<{ eventId?: string }>,
): void {
  if (eventName === "PageView") {
    ttq.page();
    return;
  }
  const trackOptions = options.eventId ? { event_id: options.eventId } : undefined;
  ttq.track(eventName, commercePayload(params), trackOptions);
}

/** Ensure the TikTok base code is injected (safe no-op when Pixel ID missing). */
export function ensureTikTokPixel(): boolean {
  try {
    return ensureTtq() !== null;
  } catch {
    return false;
  }
}

/**
 * Fire a TikTok Pixel event. Never throws — analytics must not break checkout.
 * Uses the official Array stub so pre-SDK `track('Subscribe')` is drained by
 * events.js into pixel/act (JazzCash return must not use a function/`q` stub).
 */
export function logTikTokEvent(
  eventName: string,
  params: Readonly<Record<string, string | number | boolean | undefined>> = {},
  options: Readonly<{ eventId?: string }> = {},
): void {
  try {
    const ttq = ensureTtq();
    if (!ttq) return;
    dispatchTtqEvent(ttq, eventName, params, options);
  } catch {
    // Ignore analytics failures.
  }
}
