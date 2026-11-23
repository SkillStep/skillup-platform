# TikTok Pixel integration (SkillUp)

**Status:** implemented in web app (browser Pixel).  
**Purpose:** let TikTok Ads measure and optimize traffic to the SkillUp TikTok landing and Premium conversions.  
**Rule:** TikTok Pixel is marketing only. Official Premium Subs / revenue reporting remains payment + attribution data in SkillUp admin — never Pixel counts.

---

## 1. Client input (received)

| Item | Value |
| --- | --- |
| Campaign landing | `https://skillupshop.codistan.org/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash` |
| SkillUp Pixel ID | `DBU5QHBC77UCDH70PUAG` |

### Landing meaning

| Query / path | Meaning |
| --- | --- |
| `/landing2` | TikTok / promo landing page |
| `utm=T` | TikTok traffic source |
| `package=2` | Yearly Premium package |
| `parameter=20percentoff` | 20% off yearly offer |
| `payment=jazzcash` | JazzCash checkout |

This is **not** the default `/mainLanding` page (`utm=D`).

---

## 2. What was implemented

### Runtime config

- Meta tag: `skillup-tiktok-pixel-id`
- Component: `apps/web/app/tiktok-runtime-config.tsx` (root layout)
- Resolution order:
  1. `TIKTOK_PIXEL_ID` (server / container runtime)
  2. `NEXT_PUBLIC_TIKTOK_PIXEL_ID` (build-time)
  3. Fallback: client Pixel `DBU5QHBC77UCDH70PUAG`

### Browser loader

- `apps/web/lib/tiktok-pixel.ts`
- Loads `https://analytics.tiktok.com/i18n/pixel/events.js`
- Never throws into checkout / payment UI

### Event wiring (same moments as GA4)

| SkillUp moment | GA4 | TikTok Pixel |
| --- | --- | --- |
| Landing open (`LandingAnalyticsBoot`) | `landing_view`, `view_item` | `PageView`, `ViewContent` |
| Subscribe CTA (`trackAddToCart`) | `add_to_cart`, `begin_checkout` | `AddToCart`, `InitiateCheckout` |
| JazzCash success, yearly (`package=2`) | `purchase` | `CompletePayment` (`event_id` = order id) |
| JazzCash success, monthly | `subscribe` | `Subscribe` (`event_id` = order id) |

Conversion events are deduped per `transaction_id` / order id (same session storage gate as GA4).

### CSP

`apps/web/next.config.ts` allows TikTok (and GA) script/connect/image hosts so the Pixel can load in production.

---

## 3. Environment

Set on the **web** service (staging/production):

```dotenv
# Preferred runtime (works with standalone image without rebuild)
TIKTOK_PIXEL_ID=DBU5QHBC77UCDH70PUAG

# Optional build-time fallback
NEXT_PUBLIC_TIKTOK_PIXEL_ID=DBU5QHBC77UCDH70PUAG
```

If both are unset, the app still uses the client-provided SkillUp Pixel ID above.

---

## 4. How to verify

1. Open the TikTok landing:  
   `/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash`
2. Install [TikTok Pixel Helper](https://ads.tiktok.com/help/) (Chrome) or watch Network for `analytics.tiktok.com`.
3. Confirm `PageView` / `ViewContent` on load.
4. Click **Subscribe Now** → `AddToCart` + `InitiateCheckout`.
5. Complete a staging JazzCash success return with `orderId` → one `CompletePayment` with matching `event_id`.
6. In TikTok Events Manager → Test Events, confirm the Pixel ID `DBU5QHBC77UCDH70PUAG` receives events.

Do **not** treat Pixel conversion totals as official subscription counts. Cross-check Admin → Premium → Campaign attribution (`utm=T`, `package=2`, `parameter=20percentoff`).

---

## 5. Out of scope / not included

| Item | Status |
| --- | --- |
| Meta (Facebook) Pixel | Not implemented (no Meta Pixel ID provided) |
| TikTok Events API (server-side) | Not implemented (no access token provided) |
| Changing JazzCash / billing flags | Unchanged |
| Replacing GA4 or admin attribution | Unchanged — Pixel is additive |

---

## 6. Related files

| File | Role |
| --- | --- |
| `apps/web/lib/tiktok-pixel.ts` | Pixel bootstrap + `logTikTokEvent` |
| `apps/web/app/tiktok-runtime-config.tsx` | Runtime meta tag |
| `apps/web/lib/landing-analytics.ts` | Fires TikTok + GA4 together |
| `apps/web/app/mainLanding/landing-analytics-boot.tsx` | Landing view |
| `apps/web/app/mainLanding/landing-subscribe.tsx` | CTA → AddToCart |
| `apps/web/app/[locale]/home-payment-banner.tsx` | Payment success conversion |
| `apps/web/next.config.ts` | CSP allowlist |
| `docs/product/PREMIUM_CAMPAIGN_ANALYTICS_IMPLEMENTATION.md` | Attribution + GA4 source of truth |

---

## 7. Follow-ups for the client (optional)

1. Confirm event names in TikTok Ads Manager match this mapping (`CompletePayment` for yearly).
2. Grant Events Manager access for Test Events verification on staging.
3. Provide Events API access token if server-side matching is required later.
4. Provide Meta Pixel ID separately if Meta ads need the same treatment.
